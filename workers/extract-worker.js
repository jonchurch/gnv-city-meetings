#!/usr/bin/env node
import { createWorker, connection } from '../queue/config.js';
import { getMeeting } from '../api/meetings-client.js';
import { pathFor, StorageTypes } from '../storage/paths.js';
import { advanceWorkflow, handleWorkflowFailure } from '../workflow/orchestrator.js';
import { QUEUE_NAMES } from '../workflow/config.js';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import 'dotenv/config';

const execAsync = promisify(exec);

const BASE_URL = 'https://pub-cityofgainesville.escribemeetings.com';

function formatTime(ms) {
  if (!ms) return null;
  
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
}

function formatMeetingDate(date) {
  return date.split(' ')[0].replace(/\//g, '-');
}

async function extractAudio(videoPath, audioPath) {
  console.log(JSON.stringify({
    message: 'Extracting audio from video',
    video_path: videoPath,
    audio_path: audioPath,
    step: 'audio_extract_start'
  }));
  
  try {
    // Ensure output directory exists
    const audioDir = audioPath.substring(0, audioPath.lastIndexOf('/'));
    await fs.mkdir(audioDir, { recursive: true });
    
    // Extract audio using ffmpeg
    // -i: input file
    // -vn: no video
    // -acodec copy: copy audio codec (fast, no re-encoding)
    // -y: overwrite if exists
    const command = `ffmpeg -i "${videoPath}" -vn -acodec copy -y "${audioPath}"`;
    
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for ffmpeg output
    });
    
    // Check if file was created
    const stats = await fs.stat(audioPath);
    
    console.log(JSON.stringify({
      message: 'Audio extracted successfully',
      audio_path: audioPath,
      size_mb: (stats.size / (1024 * 1024)).toFixed(2),
      step: 'audio_extract_complete'
    }));
    
    return audioPath;
    
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Audio extraction failed',
      error: error.message,
      stderr: error.stderr,
      step: 'audio_extract_error'
    }));
    throw error;
  }
}

async function extractAgendaWithTimestamps(meetingId) {
  try {
    const meetingUrl = `${BASE_URL}/Meeting.aspx?Id=${meetingId}&Agenda=Agenda&lang=English`;
    
    console.log(JSON.stringify({
      message: 'Fetching agenda',
      meeting_id: meetingId,
      url: meetingUrl,
      step: 'agenda_fetch'
    }));
    
    const response = await fetch(meetingUrl);
    const html = await response.text();
    
    const bookmarksMatch = html.match(/Bookmarks\s*:\s*\[(.*?)\]/s);
    
    if (!bookmarksMatch || !bookmarksMatch[1]) {
      console.log(JSON.stringify({
        message: 'No bookmarks found',
        meeting_id: meetingId,
        step: 'agenda_extract'
      }));
      return { meetingId, agendaItems: [] };
    }
    
    const bookmarksJson = `[${bookmarksMatch[1]}]`;
    const bookmarks = JSON.parse(bookmarksJson);
    
    const agendaItems = [];
    const itemMatches = html.matchAll(/<DIV class=['"]AgendaItem AgendaItem(\d+)['"].*?<DIV class=['"]AgendaItemTitle['"].*?><a.*?>(.*?)<\/a>/gs);
    
    for (const match of itemMatches) {
      const itemId = parseInt(match[1], 10);
      const itemTitle = match[2].trim();
      
      const bookmark = bookmarks.find(b => b.AgendaItemId === itemId);
      
      if (bookmark) {
        agendaItems.push({
          id: itemId,
          title: itemTitle,
          timeStart: bookmark.TimeStart,
          timeEnd: bookmark.TimeEnd,
          startTime: formatTime(bookmark.TimeStart),
          endTime: formatTime(bookmark.TimeEnd),
          durationSeconds: Math.floor((bookmark.TimeEnd - bookmark.TimeStart) / 1000)
        });
      } else {
        agendaItems.push({
          id: itemId,
          title: itemTitle,
          timeStart: null,
          timeEnd: null,
          startTime: null,
          endTime: null,
          durationSeconds: null
        });
      }
    }
    
    agendaItems.sort((a, b) => (a.timeStart || Infinity) - (b.timeStart || Infinity));
    
    return {
      meetingId,
      agendaItems,
      rawBookmarks: bookmarks
    };
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Agenda extraction error',
      meeting_id: meetingId,
      error: error.message,
      step: 'agenda_extract_error'
    }));
    throw error;
  }
}

function generateYouTubeChapters(meeting, agendaData) {
  const { title: meetingTitle, date } = meeting;
  const { agendaItems } = agendaData;
  
  const chaptersItems = agendaItems
    .filter(item => item.timeStart !== null)
    .sort((a, b) => a.timeStart - b.timeStart);
  
  if (chaptersItems.length === 0) {
    console.log(JSON.stringify({
      message: 'No timestamped agenda items',
      meeting_id: meeting.id,
      step: 'chapter_generation'
    }));
    return '';
  }
  
  const formattedDate = formatMeetingDate(date);
  
  let chaptersText = `${meetingTitle} - ${formattedDate}\n\n`;
  chaptersText += 'Chapters:\n';
  
  for (const item of chaptersItems) {
    if (item === chaptersItems[0] && item.startTime !== '00:00:00') {
      chaptersText += `00:00:00 Pre-meeting\n`;
    }
    
    chaptersText += `${item.startTime} ${item.title}\n`;
  }
  
  return chaptersText;
}

async function extractMeetingData(meetingId) {
  try {
    const meeting = await getMeeting(meetingId);
    
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    console.log(JSON.stringify({
      message: 'Starting agenda extraction',
      meeting_id: meetingId,
      step: 'extract_start'
    }));
    
    // Extract agenda data
    const agendaData = await extractAgendaWithTimestamps(meetingId);
    
    // Generate chapters
    const chaptersText = generateYouTubeChapters(meeting, agendaData);
    
    // Save chapters to deterministic location
    const chaptersPath = pathFor(StorageTypes.DERIVED_CHAPTERS, meetingId);
    await fs.writeFile(chaptersPath, chaptersText);
    
    // Save metadata to deterministic location
    const metadataPath = pathFor(StorageTypes.DERIVED_METADATA, meetingId);
    await fs.writeFile(metadataPath, JSON.stringify({
      meetingId,
      title: meeting.title,
      date: meeting.date,
      agendaData,
      chaptersText,
      extractedAt: new Date().toISOString()
    }, null, 2));
    
    console.log(JSON.stringify({
      message: 'Agenda extraction complete',
      meeting_id: meetingId,
      agenda_items: agendaData.agendaItems.length,
      chapters_path: chaptersPath,
      metadata_path: metadataPath,
      step: 'extract_complete'
    }));
    
    return {
      agendaData,
      chaptersText,
      chaptersPath,
      metadataPath
    };
    
  } catch (error) {
    throw error;
  }
}

async function processExtractJob(job) {
  const { meetingId } = job.data;
  
  console.log(JSON.stringify({
    message: 'Processing extract job',
    meeting_id: meetingId,
    job_id: job.id,
    step: 'job_start'
  }));
  
  try {
    // Extract agenda and generate chapters
    const result = await extractMeetingData(meetingId);
    
    // Extract audio from video for diarization
    const videoPath = pathFor(StorageTypes.RAW_VIDEO, meetingId);
    const audioPath = pathFor(StorageTypes.DERIVED_AUDIO, meetingId);
    
    try {
      await extractAudio(videoPath, audioPath);
    } catch (audioError) {
      // Log error but don't fail the job - diarization is optional
      console.error(JSON.stringify({
        message: 'Audio extraction failed but continuing',
        meeting_id: meetingId,
        error: audioError.message,
        step: 'audio_extract_warning'
      }));
    }
    
    // Advance to next step
    await advanceWorkflow(meetingId, 'DOWNLOADED', {
      agenda_data: result.agendaData,
      chapters_text: result.chaptersText
    });
    
    console.log(JSON.stringify({
      message: 'Extract job completed',
      meeting_id: meetingId,
      job_id: job.id,
      step: 'job_complete'
    }));
    
  } catch (error) {
    await handleWorkflowFailure(meetingId, 'DOWNLOADED', error);
    throw error;
  }
}

async function main() {
  console.log(JSON.stringify({
    message: 'Starting extract worker',
    queue: QUEUE_NAMES.EXTRACT,
    step: 'worker_start'
  }));
  
  const worker = createWorker(QUEUE_NAMES.EXTRACT, processExtractJob, {
    concurrency: 3, // Can extract multiple agendas in parallel
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