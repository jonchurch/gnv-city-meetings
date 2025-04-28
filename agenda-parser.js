import fs from 'fs/promises';
import path from 'path';

const BASE_URL = 'https://pub-cityofgainesville.escribemeetings.com';
const METADATA_DIR = './downloads/metadata';

/**
 * Extract agenda items with timestamps from a meeting page
 * @param {string} meetingId - The meeting ID
 * @returns {Promise<Object>} - Object containing meeting metadata with agenda items and timestamps
 */
export async function extractAgendaWithTimestamps(meetingId) {
  try {
    // Fetch the meeting page HTML
    const meetingUrl = `${BASE_URL}/Meeting.aspx?Id=${meetingId}&Agenda=Agenda&lang=English`;
    console.log(`Fetching agenda from: ${meetingUrl}`);
    
    const response = await fetch(meetingUrl);
    const html = await response.text();
    
    // Extract video bookmarks (timestamps) using regex
    const bookmarksMatch = html.match(/Bookmarks\s*:\s*\[(.*?)\]/s);
    
    if (!bookmarksMatch || !bookmarksMatch[1]) {
      console.log('No bookmarks found in the meeting page');
      return { meetingId, agendaItems: [] };
    }
    
    // Parse the bookmarks JSON
    const bookmarksJson = `[${bookmarksMatch[1]}]`;
    const bookmarks = JSON.parse(bookmarksJson);
    
    // Extract agenda items from the HTML
    const agendaItems = [];
    const itemMatches = html.matchAll(/<DIV class=['"]AgendaItem AgendaItem(\d+)['"].*?<DIV class=['"]AgendaItemTitle['"].*?><a.*?>(.*?)<\/a>/gs);
    
    for (const match of itemMatches) {
      const itemId = parseInt(match[1], 10);
      const itemTitle = match[2].trim();
      
      // Find the corresponding bookmark for this agenda item
      const bookmark = bookmarks.find(b => b.AgendaItemId === itemId);
      
      if (bookmark) {
        agendaItems.push({
          id: itemId,
          title: itemTitle,
          timeStart: bookmark.TimeStart,
          timeEnd: bookmark.TimeEnd,
          // Convert milliseconds to readable format
          startTime: formatTime(bookmark.TimeStart),
          endTime: formatTime(bookmark.TimeEnd),
          durationSeconds: Math.floor((bookmark.TimeEnd - bookmark.TimeStart) / 1000)
        });
      } else {
        // Include items without timestamps too
        agendaItems.push({
          id: itemId,
          title: itemTitle,
          timeStart: null,
          timeEnd: null,
          startTime: null,
          endTime: null,
          durationSeconds: null
        });
      }
    }
    
    // Sort by timestamp
    agendaItems.sort((a, b) => (a.timeStart || Infinity) - (b.timeStart || Infinity));
    
    return {
      meetingId,
      agendaItems,
      rawBookmarks: bookmarks
    };
  } catch (error) {
    console.error(`Error extracting agenda for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Save meeting agenda metadata to a JSON file
 * @param {string} meetingId - The meeting ID
 * @param {string} meetingTitle - The meeting title
 * @param {string} meetingDate - The meeting date
 * @param {Object} agendaData - The agenda data to save
 */
export async function saveAgendaMetadata(meetingId, meetingTitle, meetingDate, agendaData) {
  try {
    // Create metadata directory if it doesn't exist
    await fs.mkdir(METADATA_DIR, { recursive: true });
    
    const safeDate = meetingDate.split(' ')[0].replace(/\//g, '-');
    const safeTitle = meetingTitle.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
    const filename = `${safeDate}_${safeTitle}_agenda.json`;
    const filePath = path.join(METADATA_DIR, filename);
    
    const metadata = {
      meetingId,
      meetingTitle,
      meetingDate,
      extractedAt: new Date().toISOString(),
      ...agendaData
    };
    
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
    console.log(`Saved agenda metadata to: ${filePath}`);
    
    return filePath;
  } catch (error) {
    console.error('Error saving agenda metadata:', error);
    throw error;
  }
}

/**
 * Format milliseconds as HH:MM:SS
 * @param {number} ms - Milliseconds
 * @returns {string} - Formatted time string
 */
function formatTime(ms) {
  if (!ms) return null;
  
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
}

/**
 * Process a meeting to extract and save its agenda with timestamps
 * @param {Object} meeting - Meeting object with id, title, and startDate
 */
export async function processMeetingAgenda(meeting) {
  try {
    console.log(`Processing agenda for meeting: ${meeting.title} (${meeting.id})`);
    
    const agendaData = await extractAgendaWithTimestamps(meeting.id);
    
    if (agendaData.agendaItems.length > 0) {
      const metadataPath = await saveAgendaMetadata(
        meeting.id,
        meeting.title,
        meeting.startDate,
        agendaData
      );
      
      return {
        meetingId: meeting.id,
        metadataPath,
        agendaItemsCount: agendaData.agendaItems.length
      };
    } else {
      console.log(`No agenda items found for meeting: ${meeting.title}`);
      return {
        meetingId: meeting.id,
        metadataPath: null,
        agendaItemsCount: 0
      };
    }
  } catch (error) {
    console.error(`Error processing agenda for meeting ${meeting.title}:`, error);
    throw error;
  }
}
