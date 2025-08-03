#!/usr/bin/env node
import { createWorker, createQueue, connection } from './queue/config.js';
import { QUEUE_NAMES } from './workflow/config.js';
import { advanceWorkflow, handleWorkflowFailure } from './workflow/orchestrator.js';
import { initializeDatabase, getMeeting, updateMeetingState, MeetingStates } from './db/init.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import 'dotenv/config';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const WHISPERX_IMAGE = process.env.WHISPERX_IMAGE || 'ghcr.io/jim60105/whisperx:latest';
const GPU_DEVICE = process.env.GPU_DEVICE || '0';
const HF_TOKEN = process.env.HF_TOKEN;
const FILE_SERVER_HOST = process.env.FILE_SERVER_HOST || 'muadib';
const FILE_SERVER_PORT = process.env.FILE_SERVER_PORT || '3000';

// File transfer functions
async function downloadFile(url, localPath) {
  console.log(JSON.stringify({
    message: 'Downloading file',
    url,
    local_path: localPath,
    step: 'download_start'
  }));
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  
  const buffer = await response.buffer();
  await fs.writeFile(localPath, buffer);
  
  console.log(JSON.stringify({
    message: 'File downloaded successfully',
    local_path: localPath,
    size_bytes: buffer.length,
    step: 'download_complete'
  }));
}

async function uploadFile(localPath, type, meetingId) {
  const form = new FormData();
  form.append('file', fs.createReadStream(localPath));
  
  const uploadUrl = `http://${FILE_SERVER_HOST}:${FILE_SERVER_PORT}/upload/${type}/${meetingId}`;
  
  console.log(JSON.stringify({
    message: 'Uploading file',
    local_path: localPath,
    upload_url: uploadUrl.replace(FILE_SERVER_HOST, '[HOST]'), // Don't log internal hostnames
    step: 'upload_start'
  }));
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: form
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload file: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const result = await response.json();
  
  console.log(JSON.stringify({
    message: 'File uploaded successfully',
    result,
    step: 'upload_complete'
  }));
  
  return result;
}

async function runWhisperX(audioPath, outputPath) {
  if (!HF_TOKEN) {
    throw new Error('HF_TOKEN environment variable required for speaker diarization');
  }
  
  // Ensure output directory exists and is writable
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });
  // await execAsync(`chmod 777 "${path.dirname(audioPath)}"`);
  
  const cmd = `docker run --rm --gpus all \\
    -v "${path.dirname(audioPath)}:/app" \\
    -v whisper_cache:/.cache \\
    -e HF_TOKEN="${HF_TOKEN}" \\
    ghcr.io/jim60105/whisperx:latest \\
    -- --model large-v3 \\
       --language en \\
       --diarize \\
       --segment_resolution sentence \\
       --chunk_size 20 \\
       --output_format json \\
       --output_dir /app \\
       ${path.basename(audioPath)}`;
  
  console.log(JSON.stringify({
    message: 'Running WhisperX with optimized settings',
    audio_path: audioPath,
    output_path: outputPath,
    cmd: cmd.replace(HF_TOKEN, '[REDACTED]'),
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
  
  // The output file will be created as: /app/{basename_without_ext}.json
  const audioBasename = path.parse(audioPath).name;
  const containerOutputPath = path.join(path.dirname(audioPath), `${audioBasename}.json`);
  
  // Move to the expected output location if different
  if (containerOutputPath !== outputPath) {
    await fs.rename(containerOutputPath, outputPath);
  }
  
  console.log(JSON.stringify({
    message: 'WhisperX completed successfully',
    output_file: outputPath,
    step: 'whisperx_complete'
  }));
  
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
  
  // Temp file paths
  const tempDir = `/tmp/diarize_${meetingId}_${Date.now()}`;
  await fs.mkdir(tempDir, { recursive: true });
  
  const localAudioPath = path.join(tempDir, `${meetingId}_audio.mp3`);
  const localOutputPath = path.join(tempDir, `${meetingId}_diarized.json`);
  
  try {
    const meeting = await getMeeting(db, meetingId);
    
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    if (meeting.state !== MeetingStates.UPLOADED) {
      throw new Error(`Meeting ${meetingId} not in UPLOADED state (current: ${meeting.state})`);
    }
    
    // 1. Download audio file from file server
    const audioFileName = `${meetingId.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
    const audioUrl = `http://${FILE_SERVER_HOST}:${FILE_SERVER_PORT}/files/raw/audio/${audioFileName}`;
    
    console.log(JSON.stringify({
      message: 'Downloading audio for diarization',
      meeting_id: meetingId,
      audio_url: audioUrl.replace(FILE_SERVER_HOST, '[HOST]'),
      step: 'diarize_download'
    }));
    
    await downloadFile(audioUrl, localAudioPath);
    
    // 2. Run WhisperX diarization
    console.log(JSON.stringify({
      message: 'Running WhisperX diarization',
      meeting_id: meetingId,
      local_audio_path: localAudioPath,
      local_output_path: localOutputPath,
      step: 'diarize_processing'
    }));
    
    await runWhisperX(localAudioPath, localOutputPath);
    
    // 3. Verify output was created
    try {
      const stats = await fs.stat(localOutputPath);
      console.log(JSON.stringify({
        message: 'Diarization output verified',
        output_path: localOutputPath,
        size_bytes: stats.size,
        step: 'diarize_verify'
      }));
    } catch (error) {
      throw new Error(`WhisperX output not created: ${localOutputPath}`);
    }
    
    // 4. Upload results back to file server
    console.log(JSON.stringify({
      message: 'Uploading diarization results',
      meeting_id: meetingId,
      local_output_path: localOutputPath,
      step: 'diarize_upload'
    }));
    
    await uploadFile(localOutputPath, 'derived_diarized', meetingId);
    
    // 5. Advance workflow to next state
    await advanceWorkflow(meetingId, 'UPLOADED');
    
    console.log(JSON.stringify({
      message: 'Diarization completed successfully',
      meeting_id: meetingId,
      job_id: job.id,
      step: 'diarize_complete'
    }));
    
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Diarization job failed',
      meeting_id: meetingId,
      job_id: job.id,
      error: error.message,
      step: 'diarize_error'
    }));
    
    await handleWorkflowFailure(meetingId, 'UPLOADED', error);
    throw error;
  } finally {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log(JSON.stringify({
        message: 'Cleaned up temp files',
        temp_dir: tempDir,
        step: 'cleanup'
      }));
    } catch (cleanupError) {
      console.warn(JSON.stringify({
        message: 'Failed to cleanup temp files',
        temp_dir: tempDir,
        error: cleanupError.message,
        step: 'cleanup_warning'
      }));
    }
    
    await db.close();
  }
}

async function main() {
  console.log(JSON.stringify({
    message: 'Starting diarization worker',
    queue: QUEUE_NAMES.DIARIZE,
    gpu_device: GPU_DEVICE,
    file_server: `${FILE_SERVER_HOST}:${FILE_SERVER_PORT}`,
    whisperx_image: WHISPERX_IMAGE,
    step: 'worker_start'
  }));
  
  if (!HF_TOKEN) {
    console.error(JSON.stringify({
      message: 'HF_TOKEN environment variable is required',
      step: 'worker_config_error'
    }));
    process.exit(1);
  }
  
  const worker = createWorker(QUEUE_NAMES.DIARIZE, processDiarizeJob, {
    concurrency: 1, // Only one GPU job at a time
  });
  
  // Also create queue references for cleanup
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
      meeting_id: job.data?.meetingId || 'unknown',
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
