#!/usr/bin/env node
import { createWorker, QUEUE_NAMES, connection } from './queue/config.js';
import { initializeDatabase, getMeeting, updateMeetingState, MeetingStates } from './db/init.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function processMeetingJob(job) {
  const { meetingId } = job.data;
  
  console.log(JSON.stringify({
    message: 'Starting job',
    meeting_id: meetingId,
    job_id: job.id,
    step: 'job_start'
  }));
  
  try {
    // Execute process.js for this meeting
    const { stdout, stderr } = await execAsync(`node ${path.join(__dirname, 'process.js')} ${meetingId}`);
    
    if (stdout) {
      console.log(JSON.stringify({
        message: 'Job stdout',
        meeting_id: meetingId,
        stdout,
        step: 'job_output'
      }));
    }
    
    if (stderr) {
      console.error(JSON.stringify({
        message: 'Job stderr',
        meeting_id: meetingId,
        stderr,
        step: 'job_error'
      }));
    }
    
    console.log(JSON.stringify({
      message: 'Job completed successfully',
      meeting_id: meetingId,
      job_id: job.id,
      step: 'job_complete'
    }));
    
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Job failed',
      meeting_id: meetingId,
      job_id: job.id,
      error: error.message,
      stderr: error.stderr,
      step: 'job_error'
    }));
    
    throw error;
  }
}

async function main() {
  console.log(JSON.stringify({
    message: 'Starting worker',
    queue: QUEUE_NAMES.PROCESS_MEETING,
    step: 'worker_start'
  }));
  
  const worker = createWorker(QUEUE_NAMES.PROCESS_MEETING, processMeetingJob, {
    concurrency: 1,
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