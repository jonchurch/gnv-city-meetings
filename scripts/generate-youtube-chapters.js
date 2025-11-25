#!/usr/bin/env node
import * as pgDb from '../db/queries.js';

const meetingId = process.argv[2] || '0d57b610-0b15-4722-92bb-601620387cf5';

/**
 * Format seconds into YouTube chapter timestamp (MM:SS or HH:MM:SS)
 */
function formatTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

async function main() {
  console.log(`Fetching chunks for meeting: ${meetingId}\n`);

  // Get chunks ordered by sequence number
  const chunks = await pgDb.getChunks(meetingId);

  if (chunks.length === 0) {
    console.log('No chunks found for this meeting');
    process.exit(1);
  }

  console.log('=== YouTube Chapter Markers ===\n');
  console.log('Copy and paste these into the YouTube video description:\n');

  // YouTube requires first chapter to start at 0:00
  if (chunks.length > 0 && chunks[0].start_time > 0) {
    console.log('0:00 Pre-Meeting');
  }

  for (const chunk of chunks) {
    const timestamp = formatTimestamp(chunk.start_time);
    console.log(`${timestamp} ${chunk.title}`);
  }

  console.log('\n=== Chunk Details ===\n');

  for (const chunk of chunks) {
    const startTime = formatTimestamp(chunk.start_time);
    const endTime = formatTimestamp(chunk.end_time);
    const duration = Math.floor(chunk.end_time - chunk.start_time);
    const durationMins = Math.floor(duration / 60);
    const durationSecs = duration % 60;

    console.log(`[${chunk.sequence_number}] ${startTime} - ${endTime} (${durationMins}m ${durationSecs}s)`);
    console.log(`    Type: ${chunk.chunk_type}`);
    console.log(`    Title: ${chunk.title}`);
    console.log(`    Summary: ${chunk.summary.substring(0, 150)}...`);
    console.log('');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
