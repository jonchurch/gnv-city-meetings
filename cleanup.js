#!/usr/bin/env node
import { initializeDatabase, getMeetingsByState, updateMeetingState, MeetingStates } from './db/init.js';
import { pathFor, StorageTypes, exists } from './storage/paths.js';
import fs from 'fs/promises';
import 'dotenv/config';

const CLEANUP_AFTER_DAYS = parseInt(process.env.CLEANUP_AFTER_DAYS) || 30;
const DRY_RUN = process.env.DRY_RUN === 'true';

async function cleanupOldFiles() {
  const db = await initializeDatabase();
  
  try {
    // Get all diarized meetings (fully processed)
    const diarizedMeetings = await getMeetingsByState(db, MeetingStates.DIARIZED);
    
    console.log(JSON.stringify({
      message: 'Starting cleanup process',
      total_diarized: diarizedMeetings.length,
      cleanup_after_days: CLEANUP_AFTER_DAYS,
      dry_run: DRY_RUN,
      step: 'cleanup_start'
    }));
    
    let cleanedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const meeting of diarizedMeetings) {
      try {
        // Check if meeting is old enough to clean
        const meetingDate = new Date(meeting.date);
        const daysSince = (Date.now() - meetingDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSince < CLEANUP_AFTER_DAYS) {
          skippedCount++;
          continue;
        }
        
        // List of files to potentially clean up
        const filesToCheck = [
          { type: StorageTypes.RAW_VIDEO, path: pathFor(StorageTypes.RAW_VIDEO, meeting.id) },
          // Keep derived files - they're smaller and useful for reference
          // { type: StorageTypes.DERIVED_CHAPTERS, path: pathFor(StorageTypes.DERIVED_CHAPTERS, meeting.id) },
          // { type: StorageTypes.DERIVED_METADATA, path: pathFor(StorageTypes.DERIVED_METADATA, meeting.id) },
        ];
        
        for (const file of filesToCheck) {
          if (await exists(file.type, meeting.id)) {
            if (DRY_RUN) {
              console.log(JSON.stringify({
                message: 'Would delete file',
                meeting_id: meeting.id,
                file_type: file.type,
                file_path: file.path,
                step: 'cleanup_dry_run'
              }));
            } else {
              await fs.unlink(file.path);
              console.log(JSON.stringify({
                message: 'Deleted file',
                meeting_id: meeting.id,
                file_type: file.type,
                file_path: file.path,
                step: 'cleanup_delete'
              }));
            }
            cleanedCount++;
          }
        }
        
      } catch (error) {
        console.error(JSON.stringify({
          message: 'Cleanup error for meeting',
          meeting_id: meeting.id,
          error: error.message,
          step: 'cleanup_error'
        }));
        errorCount++;
      }
    }
    
    console.log(JSON.stringify({
      message: 'Cleanup complete',
      cleaned_files: cleanedCount,
      skipped_meetings: skippedCount,
      errors: errorCount,
      step: 'cleanup_complete'
    }));
    
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Cleanup process error',
      error: error.message,
      stack: error.stack,
      step: 'cleanup_fatal'
    }));
    process.exit(1);
  } finally {
    await db.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
Cleanup utility for processed meeting files

Usage: node cleanup.js [options]

Options:
  --help          Show this help
  --dry-run       Show what would be deleted without actually deleting

Environment Variables:
  CLEANUP_AFTER_DAYS=30    Only clean files older than N days (default: 30)
  DRY_RUN=true             Enable dry run mode

Examples:
  node cleanup.js --dry-run
  CLEANUP_AFTER_DAYS=60 node cleanup.js
    `);
    return;
  }
  
  if (args.includes('--dry-run')) {
    process.env.DRY_RUN = 'true';
  }
  
  await cleanupOldFiles();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}