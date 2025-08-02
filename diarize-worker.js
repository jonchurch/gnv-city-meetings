#!/usr/bin/env node
import { createWorker, createQueue, QUEUE_NAMES, connection } from './queue/config.js';
import { initializeDatabase, getMeeting, updateMeetingState, MeetingStates } from './db/init.js';
import { pathFor, StorageTypes } from './storage/paths.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// WhisperX Docker configuration
const WHISPERX_IMAGE = process.env.WHISPERX_IMAGE || 'whisperx:latest';
const GPU_DEVICE = process.env.GPU_DEVICE || '0';
const HF_TOKEN = process.env.HF_TOKEN; // Hugging Face token for speaker diarization

async function runWhisperX(videoPath, outputPath) {
  if (!HF_TOKEN) {
    throw new Error('HF_TOKEN environment variable required for speaker diarization');
  }
  
  const cmd = `docker run --rm --gpus device=${GPU_DEVICE} \
    -v "${path.dirname(videoPath)}:/input" \
    -v "${path.dirname(outputPath)}:/output" \
    -e HF_TOKEN="${HF_TOKEN}" \
    ${WHISPERX_IMAGE} \
    --model large-v3 \
    --language en \
    --diarize \
    --output_format json \
    --output_dir /output \
    /input/${path.basename(videoPath)}`;
  
  console.log(JSON.stringify({
    message: 'Running WhisperX',
    video_path: videoPath,
    output_path: outputPath,
    step: 'whisperx_start'
  }));
  
  const { stdout, stderr } = await execAsync(cmd);
  
  if (stderr) {
    console.error(JSON.stringify({
      message: 'WhisperX stderr',
      stderr,
      step: 'whisperx_output'
    }));
  }
  
  return { stdout, stderr };
}

async function processDiarizeJob(job) {
  const { meetingId } = job.data;
  const db = await initializeDatabase();
  
  console.log(JSON.stringify({
    message: 'Starting diarization job',
    meeting_id: meetingId,
    job_id: job.id,
    step: 'diarize_start'
  }));
  
  try {
    const meeting = await getMeeting(db, meetingId);
    
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    if (meeting.state !== MeetingStates.UPLOADED) {
      throw new Error(`Meeting ${meetingId} not in UPLOADED state (current: ${meeting.state})`);
    }
    
    await updateMeetingState(db, meetingId, MeetingStates.DIARIZING);
    
    const videoPath = pathFor(StorageTypes.RAW_VIDEO, meetingId);
    const outputPath = pathFor(StorageTypes.DERIVED_DIARIZED, meetingId);
    
    // For now, just log what we would do
    console.log(JSON.stringify({
      message: 'Would run WhisperX diarization',
      meeting_id: meetingId,
      video_path: videoPath,
      output_path: outputPath,
      step: 'diarize_placeholder'
    }));
    
    // Uncomment when WhisperX Docker image is ready:
    // await runWhisperX(videoPath, outputPath);
    
    await updateMeetingState(db, meetingId, MeetingStates.DIARIZED);
    
    console.log(JSON.stringify({
      message: 'Diarization completed',
      meeting_id: meetingId,
      job_id: job.id,
      step: 'diarize_complete'
    }));
    
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Diarization failed',
      meeting_id: meetingId,
      job_id: job.id,
      error: error.message,
      step: 'diarize_error'
    }));
    
    await updateMeetingState(db, meetingId, MeetingStates.FAILED, {
      error: `Diarization failed: ${error.message}`
    });
    
    throw error;
  } finally {
    await db.close();
  }
}

async function main() {
  console.log(JSON.stringify({
    message: 'Starting diarization worker',
    queue: QUEUE_NAMES.DIARIZE,
    gpu_device: GPU_DEVICE,
    step: 'worker_start'
  }));
  
  const worker = createWorker(QUEUE_NAMES.DIARIZE, processDiarizeJob, {
    concurrency: 1, // Only one GPU job at a time
  });
  
  // Also create queue to add jobs after upload
  const processingQueue = createQueue(QUEUE_NAMES.PROCESS_MEETING);
  const diarizeQueue = createQueue(QUEUE_NAMES.DIARIZE);
  
  worker.on('completed', async (job) => {
    console.log(JSON.stringify({
      message: 'Diarization job completed',
      job_id: job.id,
      meeting_id: job.data.meetingId,
      step: 'worker_event'
    }));
  });
  
  worker.on('failed', (job, err) => {
    console.error(JSON.stringify({
      message: 'Diarization job failed',
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
    await processingQueue.close();
    await diarizeQueue.close();
    await connection.quit();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log(JSON.stringify({
      message: 'Received SIGINT, closing worker',
      step: 'worker_shutdown'
    }));
    await worker.close();
    await processingQueue.close();
    await diarizeQueue.close();
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