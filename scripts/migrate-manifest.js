import fs from 'fs/promises';
import path from 'path';
import { initDatabase, upsertMeetings, updateMeetingStatus } from '../src/lib/database.js';

/**
 * Migrate existing processed-meetings.json manifest to new database structure
 */
async function migrateManifest() {
  try {
    console.log('Initializing database...');
    await initDatabase();
    
    const manifestPath = path.join(process.cwd(), 'downloads', 'processed-meetings.json');
    
    // Check if manifest exists
    try {
      await fs.access(manifestPath);
    } catch (error) {
      console.log('No existing manifest found. Starting with empty database.');
      return;
    }
    
    console.log('Reading existing manifest...');
    const manifestData = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestData);
    
    if (!manifest.processedMeetings || manifest.processedMeetings.length === 0) {
      console.log('No processed meetings found in manifest.');
      return;
    }
    
    console.log(`Found ${manifest.processedMeetings.length} processed meetings in manifest.`);
    
    // Convert manifest entries to meeting records
    const meetings = [];
    for (const entry of manifest.processedMeetings) {
      // Map old manifest format to new database format
      const meeting = {
        id: entry.id,
        title: entry.title,
        startDate: entry.date, // This will become 'date' in upsertMeeting
        meetingUrl: `https://pub-cityofgainesville.escribemeetings.com/Meeting.aspx?Id=${entry.id}`
      };
      meetings.push(meeting);
    }
    
    // Bulk insert meetings
    console.log('Inserting meetings into database...');
    await upsertMeetings(meetings);
    
    // Update status based on manifest data
    console.log('Updating meeting statuses...');
    for (const entry of manifest.processedMeetings) {
      let status = 'failed';
      let fields = {};
      
      if (entry.success) {
        if (entry.uploaded === true || entry.uploaded === 'yes') {
          status = 'uploaded';
          if (entry.youtubeUrl) {
            fields.youtube_url = entry.youtubeUrl;
          }
          if (entry.playlistIds) {
            fields.playlist_ids = JSON.stringify(entry.playlistIds);
          }
        } else {
          status = 'downloaded';
        }
      } else {
        status = 'failed';
        if (entry.error) {
          fields.last_error = entry.error;
        }
      }
      
      // Set retry count if it exists
      if (entry.retryCount) {
        fields.retry_count = entry.retryCount;
      }
      
      await updateMeetingStatus(entry.id, status, fields);
    }
    
    console.log('Migration completed successfully!');
    
    // Show summary
    const { getPipelineStats } = await import('../src/lib/database.js');
    const stats = await getPipelineStats();
    console.log('Pipeline statistics:');
    console.log(JSON.stringify(stats, null, 2));
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  migrateManifest().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { migrateManifest };