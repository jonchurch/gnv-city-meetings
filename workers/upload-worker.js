#!/usr/bin/env node
import { createWorker, connection } from '../queue/config.js';
import { getMeeting } from '../api/meetings-client.js';
import { pathFor, StorageTypes } from '../storage/paths.js';
import { advanceWorkflow, handleWorkflowFailure } from '../workflow/orchestrator.js';
import { QUEUE_NAMES } from '../workflow/config.js';
import { uploadToYouTube } from '../youtube-uploader.js';
import fs from 'fs/promises';
import 'dotenv/config';

// Map meeting titles to YouTube playlist IDs using regex patterns
const PLAYLIST_MAPPINGS = [
  { pattern: /^City Commission/i, playlistId: process.env.PLAYLIST_CITY_COMMISSION },
  { pattern: /^General Policy Committee/i, playlistId: process.env.PLAYLIST_GENERAL_POLICY },
  { pattern: /^City Plan Board/i, playlistId: process.env.PLAYLIST_CITY_PLAN_BOARD },
  { pattern: /^Utility Advisory Board/i, playlistId: process.env.PLAYLIST_UTILITY_ADVISORY_BOARD},
];

function formatMeetingDate(date) {
  return date.split(' ')[0].replace(/\//g, '-');
}

function determinePlaylistIds(meetingTitle) {
  const playlistIds = [];
  
  for (const mapping of PLAYLIST_MAPPINGS) {
    if (mapping.pattern.test(meetingTitle) && mapping.playlistId && mapping.playlistId.trim() !== '') {
      playlistIds.push(mapping.playlistId);
    }
  }
  
  return playlistIds;
}

async function uploadMeetingToYouTube(meetingId) {
  try {
    const meeting = await getMeeting(meetingId);
    
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    // Get video path
    const videoPath = pathFor(StorageTypes.RAW_VIDEO, meetingId);
    
    // Get chapters text
    const chaptersPath = pathFor(StorageTypes.DERIVED_CHAPTERS, meetingId);
    let chaptersText = '';
    try {
      chaptersText = await fs.readFile(chaptersPath, 'utf8');
    } catch (error) {
      console.log(JSON.stringify({
        message: 'No chapters file found, using empty description',
        meeting_id: meetingId,
        chapters_path: chaptersPath,
        step: 'upload_chapters'
      }));
    }
    
    const title = `${meeting.title} - ${formatMeetingDate(meeting.date)} | GNV FL`;
    
    // Determine playlists
    const playlistIds = determinePlaylistIds(meeting.title);
    if (playlistIds.length > 0) {
      console.log(JSON.stringify({
        message: 'Adding video to playlists',
        meeting_id: meetingId,
        playlist_ids: playlistIds,
        step: 'upload_playlists'
      }));
    } else {
      console.log(JSON.stringify({
        message: 'No matching playlists found',
        meeting_id: meetingId,
        meeting_title: meeting.title,
        step: 'upload_playlists'
      }));
    }
    
    console.log(JSON.stringify({
      message: 'Starting YouTube upload',
      meeting_id: meetingId,
      title,
      video_path: videoPath,
      step: 'upload_start'
    }));
    
    const ytResult = await uploadToYouTube({
      videoPath,
      title,
      description: chaptersText,
      tags: ['Gainesville'],
      privacyStatus: 'public',
      playlistIds
    });
    
    console.log(JSON.stringify({
      message: 'YouTube upload complete',
      meeting_id: meetingId,
      youtube_url: ytResult.url,
      video_id: ytResult.videoId,
      playlist_results: ytResult.playlistResults,
      step: 'upload_complete'
    }));
    
    return ytResult;
    
  } catch (error) {
    throw error;
  }
}

async function processUploadJob(job) {
  const { meetingId } = job.data;
  
  console.log(JSON.stringify({
    message: 'Processing upload job',
    meeting_id: meetingId,
    job_id: job.id,
    step: 'job_start'
  }));
  
  try {
    // Upload to YouTube
    const ytResult = await uploadMeetingToYouTube(meetingId);
    
    // Advance to next step
    await advanceWorkflow(meetingId, 'EXTRACTED', {
      youtube_url: ytResult.url,
      youtube_video_id: ytResult.videoId,
      playlist_results: ytResult.playlistResults
    });
    
    console.log(JSON.stringify({
      message: 'Upload job completed',
      meeting_id: meetingId,
      job_id: job.id,
      youtube_url: ytResult.url,
      step: 'job_complete'
    }));
    
  } catch (error) {
    await handleWorkflowFailure(meetingId, 'EXTRACTED', error);
    throw error;
  }
}

async function main() {
  console.log(JSON.stringify({
    message: 'Starting upload worker',
    queue: QUEUE_NAMES.UPLOAD,
    step: 'worker_start'
  }));
  
  const worker = createWorker(QUEUE_NAMES.UPLOAD, processUploadJob, {
    concurrency: 1, // YouTube uploads should be sequential to avoid rate limits
  });
  
  worker.on('completed', (job) => {
    console.log(JSON.stringify({
      message: 'Job completed',
      job_id: job.id,
      meeting_id: job.data.meetingId,
      step: 'worker_event'
    }));
  });
  
  worker.on('failed', (job, err) => {
    console.error(JSON.stringify({
      message: 'Job failed',
      job_id: job.id,
      meeting_id: job.data.meetingId,
      error: err.message,
      step: 'worker_event'
    }));
  });
  
  worker.on('error', (err) => {
    console.error(JSON.stringify({
      message: 'Worker error',
      error: err.message,
      step: 'worker_error'
    }));
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log(JSON.stringify({
      message: 'Received SIGTERM, closing worker',
      step: 'worker_shutdown'
    }));
    await worker.close();
    await connection.quit();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log(JSON.stringify({
      message: 'Received SIGINT, closing worker',
      step: 'worker_shutdown'
    }));
    await worker.close();
    await connection.quit();
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(JSON.stringify({
      message: 'Fatal worker error',
      error: error.message,
      stack: error.stack,
      step: 'worker_fatal'
    }));
    process.exit(1);
  });
}