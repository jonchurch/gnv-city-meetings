#!/usr/bin/env node
import { createQueue } from '../queue/config.js';
import { QUEUE_NAMES } from '../workflow/config.js';
import { getMeeting, updateMeetingState } from '../api/meetings-client.js';
import { WORKFLOW_STEPS } from '../workflow/config.js';
import { restartWorkflow } from '../workflow/orchestrator.js';

const VALID_QUEUES = Object.values(QUEUE_NAMES);
const VALID_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'];

/**
 * List jobs in a queue
 */
async function listJobs(queueName, state = 'all', limit = 10) {
  const queue = createQueue(queueName);
  
  const states = state === 'all' ? VALID_STATES : [state];
  const jobs = await queue.getJobs(states, 0, limit);
  
  console.log(`\n=== ${queueName.toUpperCase()} Queue ===`);
  console.log(`Found ${jobs.length} jobs\n`);
  
  for (const job of jobs) {
    const jobState = await job.getState();
    const { meetingId } = job.data;
    
    // Get meeting title for context
    let meetingTitle = 'Unknown';
    try {
      const meeting = await getMeeting(meetingId);
      meetingTitle = meeting?.title || 'Unknown';
    } catch (e) {
      // API might be down, continue without title
    }
    
    console.log(`ID: ${job.id}`);
    console.log(`State: ${jobState}`);
    console.log(`Meeting: ${meetingId}`);
    console.log(`Title: ${meetingTitle}`);
    if (jobState === 'failed' && job.failedReason) {
      console.log(`Error: ${job.failedReason}`);
    }
    console.log('---');
  }
  
  await queue.close();
}

/**
 * Remove a job by ID
 */
async function removeJob(queueName, jobId) {
  const queue = createQueue(queueName);
  const job = await queue.getJob(jobId);
  
  if (!job) {
    console.log(`Job ${jobId} not found in ${queueName} queue`);
    await queue.close();
    return;
  }
  
  const state = await job.getState();
  console.log(`Removing job ${jobId} (state: ${state})...`);
  
  await job.remove();
  console.log(`✓ Job ${jobId} removed`);
  
  await queue.close();
}

/**
 * Retry a failed job
 */
async function retryJob(queueName, jobId) {
  const queue = createQueue(queueName);
  const job = await queue.getJob(jobId);
  
  if (!job) {
    console.log(`Job ${jobId} not found in ${queueName} queue`);
    await queue.close();
    return;
  }
  
  const state = await job.getState();
  if (state !== 'failed') {
    console.log(`Job ${jobId} is not failed (current state: ${state})`);
    await queue.close();
    return;
  }
  
  console.log(`Retrying job ${jobId}...`);
  await job.retry();
  console.log(`✓ Job ${jobId} moved to waiting`);
  
  await queue.close();
}

/**
 * Add a job for a meeting with proper ID
 */
async function addJob(queueName, meetingId) {
  const queue = createQueue(queueName);
  const jobId = `${queueName}-${meetingId}`;
  
  // Check if job already exists
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    console.log(`Job ${jobId} already exists (state: ${state})`);
    console.log('Use "retry" to retry failed jobs or "remove" then "add" to replace');
    await queue.close();
    return;
  }
  
  // Verify meeting exists
  try {
    const meeting = await getMeeting(meetingId);
    if (!meeting) {
      console.log(`Meeting ${meetingId} not found`);
      await queue.close();
      return;
    }
    console.log(`Adding job for meeting: ${meeting.title}`);
  } catch (e) {
    console.log(`Warning: Could not verify meeting exists (API may be down)`);
  }
  
  const job = await queue.add('process', { meetingId }, { jobId });
  console.log(`✓ Job added: ${job.id}`);
  
  await queue.close();
}

/**
 * Clean up old jobs in a queue
 */
async function cleanQueue(queueName, state, maxAge = '1 day ago') {
  const queue = createQueue(queueName);
  
  console.log(`Cleaning ${state} jobs older than ${maxAge} from ${queueName}...`);
  
  const count = await queue.clean(
    24 * 60 * 60 * 1000, // 1 day in ms
    100, // limit
    state
  );
  
  console.log(`✓ Cleaned ${count} jobs`);
  await queue.close();
}

/**
 * Clear ALL jobs of a given state (regardless of age)
 */
async function clearJobs(queueName, state) {
  const queue = createQueue(queueName);
  
  const jobs = await queue.getJobs([state], 0, 1000);
  console.log(`Clearing ${jobs.length} ${state} jobs from ${queueName}...`);
  
  let removed = 0;
  for (const job of jobs) {
    await job.remove();
    removed++;
  }
  
  console.log(`✓ Cleared ${removed} jobs`);
  await queue.close();
}

/**
 * Show queue statistics
 */
async function queueStats(queueName) {
  const queue = createQueue(queueName);
  
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const completed = await queue.getCompletedCount();
  const failed = await queue.getFailedCount();
  const delayed = await queue.getDelayedCount();
  
  console.log(`\n=== ${queueName.toUpperCase()} Queue Stats ===`);
  console.log(`Waiting: ${waiting}`);
  console.log(`Active: ${active}`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Delayed: ${delayed}`);
  console.log(`Total: ${waiting + active + completed + failed + delayed}`);
  
  await queue.close();
}

/**
 * Show meeting status and related jobs
 */
async function meetingStatus(meetingId) {
  try {
    const meeting = await getMeeting(meetingId);
    if (!meeting) {
      console.log(`Meeting ${meetingId} not found`);
      return;
    }
    
    console.log(`\n=== Meeting Status ===`);
    console.log(`ID: ${meeting.id}`);
    console.log(`Title: ${meeting.title}`);
    console.log(`Date: ${meeting.date}`);
    console.log(`State: ${meeting.state}`);
    if (meeting.video_path) console.log(`Video: ${meeting.video_path}`);
    if (meeting.youtube_url) console.log(`YouTube: ${meeting.youtube_url}`);
    if (meeting.error) console.log(`Error: ${meeting.error}`);
    
    // Find related jobs in all queues
    console.log(`\n=== Related Jobs ===`);
    for (const queueName of VALID_QUEUES) {
      const queue = createQueue(queueName);
      const expectedJobId = `${queueName}-${meetingId}`;
      const job = await queue.getJob(expectedJobId);
      
      if (job) {
        const state = await job.getState();
        console.log(`${queueName}: ${expectedJobId} (${state})`);
        if (state === 'failed' && job.failedReason) {
          console.log(`  Error: ${job.failedReason}`);
        }
      }
      
      await queue.close();
    }
  } catch (error) {
    console.error(`Error fetching meeting: ${error.message}`);
  }
}

/**
 * Reset meeting state and restart workflow
 */
async function restartMeeting(meetingId, fromState) {
  try {
    const meeting = await getMeeting(meetingId);
    if (!meeting) {
      console.log(`Meeting ${meetingId} not found`);
      return;
    }
    
    console.log(`Restarting meeting workflow:`);
    console.log(`  Meeting: ${meeting.title}`);
    console.log(`  From state: ${fromState}`);
    console.log(`  Current state: ${meeting.state}`);
    
    await restartWorkflow(meetingId, fromState);
    console.log(`✓ Meeting workflow restarted`);
    
  } catch (error) {
    console.error(`Error restarting meeting: ${error.message}`);
  }
}

/**
 * Set meeting state directly
 */
async function setMeetingState(meetingId, newState) {
  try {
    const meeting = await getMeeting(meetingId);
    if (!meeting) {
      console.log(`Meeting ${meetingId} not found`);
      return;
    }
    
    console.log(`Setting meeting state:`);
    console.log(`  Meeting: ${meeting.title}`);
    console.log(`  From: ${meeting.state} → To: ${newState}`);
    
    await updateMeetingState(meetingId, newState);
    console.log(`✓ Meeting state updated`);
    
  } catch (error) {
    console.error(`Error updating meeting state: ${error.message}`);
  }
}

async function main() {
  const [command, arg1, ...args] = process.argv.slice(2);
  
  if (!command) {
    console.log(`
Usage: node queue-manager.js <command> [options]

Queue Commands:
  list <queue> [state] [limit]     - List jobs (state: all, waiting, active, failed, completed)
  stats <queue>                    - Show queue statistics  
  add <queue> <meetingId>          - Add job with proper ID
  retry <queue> <jobId>            - Retry a failed job
  remove <queue> <jobId>           - Remove a job
  clean <queue> <state>            - Clean old jobs (state: completed, failed)
  clear <queue> <state>            - Clear ALL jobs of state (regardless of age)

Meeting Commands:
  meeting <meetingId>              - Show meeting status and related jobs
  restart <meetingId> <state>      - Restart meeting workflow from state
  set-state <meetingId> <state>    - Set meeting state directly

Queues: ${VALID_QUEUES.join(', ')}
States: DISCOVERED, DOWNLOADED, EXTRACTED, UPLOADED, DIARIZED, FAILED

Examples:
  node queue-manager.js meeting b27b5bd3-369f-4a0a-a942-255b10698bd2
  node queue-manager.js restart b27b5bd3-369f-4a0a-a942-255b10698bd2 UPLOADED
  node queue-manager.js set-state b27b5bd3-369f-4a0a-a942-255b10698bd2 UPLOADED
  node queue-manager.js list diarize failed
`);
    process.exit(1);
  }
  
  try {
    switch (command) {
      // Meeting commands
      case 'meeting':
        if (!arg1) {
          console.error('Missing meetingId argument');
          process.exit(1);
        }
        await meetingStatus(arg1);
        break;
      case 'restart':
        if (!arg1 || !args[0]) {
          console.error('Usage: restart <meetingId> <state>');
          process.exit(1);
        }
        await restartMeeting(arg1, args[0]);
        break;
      case 'set-state':
        if (!arg1 || !args[0]) {
          console.error('Usage: set-state <meetingId> <state>');
          process.exit(1);
        }
        await setMeetingState(arg1, args[0]);
        break;
      
      // Queue commands (require valid queue name)
      case 'list':
      case 'stats':
      case 'add':
      case 'retry':
      case 'remove':
      case 'clean':
      case 'clear':
        if (!VALID_QUEUES.includes(arg1)) {
          console.error(`Invalid queue: ${arg1}`);
          console.error(`Valid queues: ${VALID_QUEUES.join(', ')}`);
          process.exit(1);
        }
        
        switch (command) {
          case 'list':
            await listJobs(arg1, args[0] || 'all', parseInt(args[1]) || 10);
            break;
          case 'stats':
            await queueStats(arg1);
            break;
          case 'add':
            if (!args[0]) {
              console.error('Missing meetingId argument');
              process.exit(1);
            }
            await addJob(arg1, args[0]);
            break;
          case 'retry':
            if (!args[0]) {
              console.error('Missing jobId argument');
              process.exit(1);
            }
            await retryJob(arg1, args[0]);
            break;
          case 'remove':
            if (!args[0]) {
              console.error('Missing jobId argument');
              process.exit(1);
            }
            await removeJob(arg1, args[0]);
            break;
          case 'clean':
            if (!args[0]) {
              console.error('Missing state argument (completed, failed)');
              process.exit(1);
            }
            await cleanQueue(arg1, args[0]);
            break;
          case 'clear':
            if (!args[0]) {
              console.error('Missing state argument (completed, failed, waiting, active)');
              process.exit(1);
            }
            await clearJobs(arg1, args[0]);
            break;
        }
        break;
        
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

main();