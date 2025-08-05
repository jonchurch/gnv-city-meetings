#!/usr/bin/env node
import { createWorker, createQueue, connection } from '../queue/config.js';
import { advanceWorkflow, handleWorkflowFailure } from '../workflow/orchestrator.js';
import { QUEUE_NAMES } from '../workflow/config.js';
import { getMeeting, updateMeetingState } from '../api/meetings-client.js';
import { MeetingStates } from '../db/init.js';
import { readFile, writeFile, StorageTypes } from '../storage/paths.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import 'dotenv/config';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const WHISPERX_IMAGE = process.env.WHISPERX_IMAGE || 'ghcr.io/jim60105/whisperx:latest';
const GPU_DEVICE = process.env.GPU_DEVICE || '0';
const HF_TOKEN = process.env.HF_TOKEN;

async function runWhisperX(audioPath, outputPath) {
  if (!HF_TOKEN) {
    throw new Error('HF_TOKEN environment variable required for speaker diarization');
  }
  
  // Ensure output directory exists and is writable
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });
  
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
  
  console.log(JSON.stringify({
    message: 'Starting diarization job',
    meeting_id: meetingId,
    job_id: job.id,
    step: 'diarize_start'
  }));
  
  // Temp file paths
  const tempDir = `/tmp/diarize_${meetingId}_${Date.now()}`;
  try {
    // Create a new tmp dir with 777 permissions to use as volume, so container user can write to it
    // and so we don't need to mount /tmp as the volume just to write to /tmp
    //
    // bc we are not using a true docker volume, but a bind mount,
    // making sure the dir is writable to the container user is important
    // 
    // we can do this mkdir with mode to give the docker user permissions to write to the dir the current user wrote
    // but wsl and other umasks will still influence this, my wsl umask is overriding the 777 to 755 here!
    await fs.mkdir(tempDir, { recursive: true, mode: 0o777 });
    // to get around the umask, we can set perms after creating the dir
    await fs.chmod(tempDir, 0o777);
    // (we could just skip the mode arg if we are gonna chmod,
    // but eh, at least the intent to create a 777 dir is refactor resistant, when baked into creation)
  } catch(err) {
    console.error("Error creating tmpdir")
    console.error(err)
    await handleWorkflowFailure(meetingId, 'UPLOADED', err);
    throw err;
  }
  
  const localAudioPath = path.join(tempDir, `${meetingId}_audio.m4a`);
  const localOutputPath = path.join(tempDir, `${meetingId}_diarized.json`);
  
  try {
    const meeting = await getMeeting(meetingId);
    
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    if (meeting.state !== MeetingStates.UPLOADED) {
      throw new Error(`Meeting ${meetingId} not in UPLOADED state (current: ${meeting.state})`);
    }
    
    // 1. Download extracted audio file from file server
    console.log(JSON.stringify({
      message: 'Downloading extracted audio for diarization',
      meeting_id: meetingId,
      local_path: localAudioPath,
      step: 'diarize_download'
    }));
    
    await readFile(StorageTypes.DERIVED_AUDIO, meetingId, localAudioPath);
    
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
    
    await writeFile(localOutputPath, StorageTypes.DERIVED_DIARIZED, meetingId);
    
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
  }
}

async function main() {
  console.log(JSON.stringify({
    message: 'Starting diarization worker',
    queue: QUEUE_NAMES.DIARIZE,
    gpu_device: GPU_DEVICE,
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
//  const processingQueue = createQueue(QUEUE_NAMES.PROCESS_MEETING);
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
