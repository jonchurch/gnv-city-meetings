#!/usr/bin/env node
import { createWorker, connection } from '../queue/config.js';
import { getMeeting } from '../api/meetings-client.js';
import { pathFor, StorageTypes, ensureStorageDirs } from '../storage/paths.js';
import { advanceWorkflow, handleWorkflowFailure } from '../workflow/orchestrator.js';
import { QUEUE_NAMES } from '../workflow/config.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import 'dotenv/config';

const execAsync = promisify(exec);
const YTDLP_PATH = process.env.YTDLP_PATH || '/Users/jon/Spoons/yt-dlp/yt_dlp/__main__.py';

async function downloadVideo(meetingId) {
  try {
    const meeting = await getMeeting(meetingId);
    
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    const outputPath = pathFor(StorageTypes.RAW_VIDEO, meetingId);
    
    const cmd = YTDLP_PATH.includes('/') ? 
      `python3 "${YTDLP_PATH}" "${meeting.meeting_url}" --output "${outputPath}"` :
      `${YTDLP_PATH} "${meeting.meeting_url}" --output "${outputPath}"`;
    
    console.log(JSON.stringify({
      message: 'Starting video download',
      meeting_id: meetingId,
      output_path: outputPath,
      step: 'download_start'
    }));
    
    const { stdout, stderr } = await execAsync(cmd);
    
    if (stderr) {
      console.error(JSON.stringify({
        message: 'Download stderr',
        meeting_id: meetingId,
        stderr,
        step: 'download_output'
      }));
    }
    
    console.log(JSON.stringify({
      message: 'Video download complete',
      meeting_id: meetingId,
      output_path: outputPath,
      step: 'download_complete'
    }));
    
    return { outputPath };
    
  } catch (error) {
    throw error;
  }
}

async function processDownloadJob(job) {
  const { meetingId } = job.data;
  
  console.log(JSON.stringify({
    message: 'Processing download job',
    meeting_id: meetingId,
    job_id: job.id,
    step: 'job_start'
  }));
  
  try {
    // Ensure storage directories exist
    await ensureStorageDirs();
    
    // Download the video
    const result = await downloadVideo(meetingId);
    
    // Advance to next step
    await advanceWorkflow(meetingId, 'DISCOVERED', {
      video_path: result.outputPath
    });
    
    console.log(JSON.stringify({
      message: 'Download job completed',
      meeting_id: meetingId,
      job_id: job.id,
      step: 'job_complete'
    }));
    
  } catch (error) {
    await handleWorkflowFailure(meetingId, 'DISCOVERED', error);
    throw error;
  }
}

async function main() {
  console.log(JSON.stringify({
    message: 'Starting download worker',
    queue: QUEUE_NAMES.DOWNLOAD,
    step: 'worker_start'
  }));
  
  const worker = createWorker(QUEUE_NAMES.DOWNLOAD, processDownloadJob, {
    concurrency: 2, // Can download multiple videos in parallel
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