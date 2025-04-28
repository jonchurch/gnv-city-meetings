import fs from 'fs/promises';
import { fetchMeetingsWithVideo } from './index.js';
import { processMeetingAgenda } from './agenda-parser.js';

/**
 * Extract agenda data for all meetings with videos without downloading videos
 */
async function extractAllAgendas() {
  try {
    // Create metadata directory if it doesn't exist
    await fs.mkdir('./downloads/metadata', { recursive: true });
    
    // Fetch meetings with videos
    const meetings = await fetchMeetingsWithVideo();
    console.log(`Found ${meetings.length} meetings with video to process.`);
    
    const results = [];
    
    // Process agendas for each meeting
    for (const meeting of meetings) {
      try {
        console.log(`Processing agenda for: ${meeting.title} (${meeting.startDate})`);
        const result = await processMeetingAgenda(meeting);
        
        results.push({
          meetingId: meeting.id,
          title: meeting.title,
          date: meeting.startDate,
          agendaItemsCount: result.agendaItemsCount,
          success: true
        });
        
        console.log(`Successfully processed agenda with ${result.agendaItemsCount} items`);
      } catch (error) {
        console.error(`Failed to process agenda for ${meeting.title}:`, error);
        
        results.push({
          meetingId: meeting.id,
          title: meeting.title,
          date: meeting.startDate,
          success: false,
          error: error.message
        });
      }
    }
    
    // Log summary
    console.log('\nSummary:');
    console.log(`Total meetings processed: ${results.length}`);
    console.log(`Successful: ${results.filter(r => r.success).length}`);
    console.log(`Failed: ${results.filter(r => !r.success).length}`);
    
    return results;
  } catch (error) {
    console.error('Error in extractAllAgendas:', error);
    throw error;
  }
}

// Run the extraction
extractAllAgendas().catch(console.error);