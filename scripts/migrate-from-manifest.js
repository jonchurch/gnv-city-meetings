#!/usr/bin/env node
import { initializeDatabase, insertMeeting, updateMeetingState, MeetingStates } from '../db/init.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrateFromManifest() {
  const manifestPath = path.join(__dirname, '..', 'downloads', 'processed-meetings.json');
  
  try {
    const manifestData = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestData);
    
    console.log(`Found ${manifest.processedMeetings.length} meetings in manifest`);
    
    const db = await initializeDatabase();
    
    for (const entry of manifest.processedMeetings) {
      const meeting = {
        id: entry.id,
        title: entry.title || 'Unknown',
        date: entry.date || entry.processedAt,
        meeting_url: `https://pub-cityofgainesville.escribemeetings.com/Meeting.aspx?Id=${entry.id}`,
        has_video: true
      };
      
      await insertMeeting(db, meeting);
      
      // Set appropriate state based on manifest entry
      let state = MeetingStates.DISCOVERED;
      const updates = {};
      
      if (entry.success) {
        if (entry.youtubeUrl) {
          state = MeetingStates.UPLOADED;
          updates.youtube_url = entry.youtubeUrl;
        } else {
          state = MeetingStates.PROCESSING;
        }
      } else if (entry.error) {
        state = MeetingStates.FAILED;
        updates.error = entry.error;
      }
      
      await updateMeetingState(db, entry.id, state, updates);
      
      console.log(`Migrated meeting ${entry.id} with state ${state}`);
    }
    
    await db.close();
    console.log('Migration complete!');
    console.log(`You can now delete ${manifestPath}`);
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No manifest file found - nothing to migrate');
    } else {
      console.error('Migration error:', error);
      process.exit(1);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateFromManifest();
}