#!/usr/bin/env node
import { initializeDatabase, getMeeting, updateMeetingState } from '../db/init.js';
import { restartWorkflow } from '../workflow/orchestrator.js';
import { createQueue } from '../queue/config.js';
import { QUEUE_NAMES } from '../workflow/config.js';

async function listMeetings() {
  const db = await initializeDatabase();
  
  console.log('\n=== Current Meetings in Database ===\n');
  
  const meetings = await db.all(`
    SELECT id, state, title, date, youtube_url, error
    FROM meetings 
    ORDER BY date DESC 
    LIMIT 20
  `);
  
  for (const meeting of meetings) {
    console.log(`ID: ${meeting.id}`);
    console.log(`State: ${meeting.state}`);
    console.log(`Title: ${meeting.title}`);
    console.log(`Date: ${meeting.date}`);
    if (meeting.youtube_url) console.log(`YouTube: ${meeting.youtube_url}`);
    if (meeting.error) console.log(`Error: ${meeting.error}`);
    console.log('---');
  }
  
  await db.close();
  return meetings;
}

async function triggerDownload(meetingId) {
  const db = await initializeDatabase();
  
  // Get the meeting
  const meeting = await getMeeting(db, meetingId);
  if (!meeting) {
    console.error(`Meeting ${meetingId} not found`);
    await db.close();
    return;
  }
  
  console.log(`\nTriggering download for meeting: ${meeting.title}`);
  console.log(`Current state: ${meeting.state}`);
  
  // Update state to DISCOVERED if needed
  if (meeting.state !== 'DISCOVERED') {
    console.log('Resetting state to DISCOVERED...');
    await updateMeetingState(db, meetingId, 'DISCOVERED');
  }
  
  // Add to download queue
  const queue = createQueue(QUEUE_NAMES.DOWNLOAD);
  await queue.add('process', { meetingId }, {
    jobId: `download-${meetingId}`,
  });
  await queue.close();
  
  console.log(`✓ Job queued: download-${meetingId}`);
  
  await db.close();
}

async function triggerFromState(meetingId, state) {
  const db = await initializeDatabase();
  
  // Get the meeting
  const meeting = await getMeeting(db, meetingId);
  if (!meeting) {
    console.error(`Meeting ${meetingId} not found`);
    await db.close();
    return;
  }
  
  console.log(`\nRestarting workflow for: ${meeting.title}`);
  console.log(`From state: ${state}`);
  
  await restartWorkflow(meetingId, state);
  
  console.log(`✓ Workflow restarted from ${state}`);
  
  await db.close();
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  try {
    if (!command || command === 'list') {
      await listMeetings();
    } else if (command === 'download') {
      const meetingId = args[1];
      if (!meetingId) {
        console.error('Usage: node trigger-job.js download <meeting-id>');
        process.exit(1);
      }
      await triggerDownload(meetingId);
    } else if (command === 'restart') {
      const meetingId = args[1];
      const state = args[2] || 'DISCOVERED';
      if (!meetingId) {
        console.error('Usage: node trigger-job.js restart <meeting-id> [state]');
        console.error('States: DISCOVERED, DOWNLOADED, EXTRACTED, UPLOADED');
        process.exit(1);
      }
      await triggerFromState(meetingId, state);
    } else {
      console.log('Usage:');
      console.log('  node trigger-job.js list                    - List all meetings');
      console.log('  node trigger-job.js download <meeting-id>   - Trigger download for a meeting');
      console.log('  node trigger-job.js restart <meeting-id> [state] - Restart from a specific state');
      console.log('\nStates: DISCOVERED, DOWNLOADED, EXTRACTED, UPLOADED');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  // Ensure clean exit
  process.exit(0);
}

main();