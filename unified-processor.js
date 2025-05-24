import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { uploadToYouTube } from './youtube-uploader.js';
import 'dotenv/config';

const BASE_URL = 'https://pub-cityofgainesville.escribemeetings.com';
const API_URL = `${BASE_URL}/MeetingsCalendarView.aspx/GetAllMeetings`;
const DOWNLOAD_DIR = './downloads';
const METADATA_DIR = './downloads/metadata';
const CHAPTERS_DIR = './downloads/youtube-chapters';

// Map meeting titles to YouTube playlist IDs using regex patterns
const PLAYLIST_MAPPINGS = [
  { pattern: /^City Commission/i, playlistId: process.env.PLAYLIST_CITY_COMMISSION },
  { pattern: /^General Policy Committee/i, playlistId: process.env.PLAYLIST_GENERAL_POLICY },
  { pattern: /^City Plan Board/i, playlistId: process.env.PLAYLIST_CITY_PLAN_BOARD },
  // Add more mappings as needed
];

// Use environment variable for YTDLP_PATH if available, otherwise use default
const YTDLP_PATH = process.env.YTDLP_PATH || '/Users/jon/Spoons/yt-dlp/yt_dlp/__main__.py';

const execAsync = promisify(exec);

/**
 * Format the meeting date into a safe kebob case date
 */
const formatMeetingDate = (date) => date.split(' ')[0].replace(/\//g, '-');

/**
 * Determine which playlists a meeting belongs to based on its title
 * @param {string} meetingTitle - The title of the meeting
 * @returns {string[]} - Array of playlist IDs (empty if no matches)
 */
function determinePlaylistIds(meetingTitle) {
  const playlistIds = [];
  
  for (const mapping of PLAYLIST_MAPPINGS) {
    if (mapping.pattern.test(meetingTitle) && mapping.playlistId) {
      playlistIds.push(mapping.playlistId);
    }
  }
  
  return playlistIds;
}

/**
 * Process a date range to get meetings
 * If no dates provided, defaults to current month
 */
function getDateRange(startDate, endDate) {
  if (startDate && endDate) {
    return {
      start: startDate,
      end: endDate
    };
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const toISOStringWithOffset = (date) =>
    date.toISOString().replace('Z', '-04:00');

  return {
    start: toISOStringWithOffset(start),
    end: toISOStringWithOffset(end),
  };
}

/**
 * Sanitize a string for use in filenames
 */
function sanitizeFilename(name) {
  return name.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
}

/**
 * Fetch meetings with video from the API
 */
async function fetchMeetingsWithVideo(startDate, endDate) {
  const { start, end } = getDateRange(startDate, endDate);
  console.log(`Fetching meetings from ${start} to ${end}`);

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      calendarStartDate: start,
      calendarEndDate: end,
    }),
  });

  const data = await res.json();
  const meetings = data.d;

  const meetingsWithVideo = meetings
    .filter((meeting) => meeting.HasVideo)
    .map((meeting) => ({
      title: meeting.MeetingName,
      meetingUrl: `${BASE_URL}/Meeting.aspx?Id=${meeting.ID}`,
      startDate: meeting.StartDate,
      id: meeting.ID
    }));

  console.log(`Found ${meetingsWithVideo.length} meetings with video.`);
  return meetingsWithVideo;
}

/**
 * Extract agenda items with timestamps from a meeting page
 */
async function extractAgendaWithTimestamps(meetingId) {
  try {
    // Fetch the meeting page HTML
    const agendaUrl = `${BASE_URL}/Meeting.aspx?Id=${meetingId}&Agenda=Agenda&lang=English`;
    console.log(`Fetching agenda from: ${agendaUrl}`);
    
    const response = await fetch(agendaUrl);
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
      agendaUrl,
      rawBookmarks: bookmarks,
    };
  } catch (error) {
    console.error(`Error extracting agenda for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Format milliseconds as HH:MM:SS
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
 * Generate YouTube chapters format from agenda metadata
 */
function generateYouTubeChapters(meeting, agendaData) {
  const { title: meetingTitle, startDate } = meeting;
  const { agendaItems, agendaUrl } = agendaData;
  
  // Filter out items without timestamps and sort by timeStart
  const chaptersItems = agendaItems
    .filter(item => item.timeStart !== null)
    .sort((a, b) => a.timeStart - b.timeStart);
  
  if (chaptersItems.length === 0) {
    console.log('No timestamped agenda items found');
    return '';
  }
  
  // Format the date for the title
  const formattedDate = formatMeetingDate(startDate)
  
  // Create chapter lines in YouTube format (00:00:00 Chapter Title)
  let chaptersText = `${meetingTitle} - ${formattedDate}\n`;

  chaptersText += `View the official agenda at ${agendaUrl}\n\n`
  
  for (const item of chaptersItems) {
    // YouTube requires the first chapter to start at 00:00:00
    // If our first chapter doesn't start at 0, add a "Pre-meeting" chapter
    if (item === chaptersItems[0] && item.startTime !== '00:00:00') {
      chaptersText += `00:00:00 Pre-meeting\n`;
    }
    
    chaptersText += `${item.startTime} ${item.title}\n`;
  }
  
  return chaptersText;
}

/**
 * Download a meeting video using yt-dlp
 */
async function downloadMeeting(meeting) {
  const { title, meetingUrl, startDate, id } = meeting;
  const safeTitle = sanitizeFilename(title);
  const safeDate = formatMeetingDate(startDate)
  const filename = `${safeDate}_${safeTitle}`;
  const outputPath = path.join(DOWNLOAD_DIR, `${filename}.mp4`);

  // If YTDLP_PATH contains a path, use python3 to execute it, otherwise assume it's in PATH
  const cmd = YTDLP_PATH.includes('/') ? 
    `python3 "${YTDLP_PATH}" "${meetingUrl}" --output "${outputPath}"` :
    `${YTDLP_PATH} "${meetingUrl}" --output "${outputPath}"`;

  console.log(`Downloading video for: ${filename}`);
  console.log(`Using command: ${cmd}`);
  try {
    const { stdout, stderr } = await execAsync(cmd);
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    // Return the output file pattern
    return {
      meetingId: id,
      outputPath,
      filename: filename
    };
  } catch (err) {
    console.error(`Error downloading ${title}:`, err.stderr || err);
    throw err;
  }
}

/**
 * Save meeting metadata and chapters
 */
async function saveMetadata(meeting, agendaData, options = {}) {
  const { title, startDate, id } = meeting;
  const { skipDownload } = options;
  
  try {
    // Create directories if they don't exist
    await fs.mkdir(METADATA_DIR, { recursive: true });
    await fs.mkdir(CHAPTERS_DIR, { recursive: true });
    
    const safeDate = formatMeetingDate(startDate)
    const safeTitle = sanitizeFilename(title);
    
    // Save agenda metadata
    const metadataFilename = `${safeDate}_${safeTitle}_agenda.json`;
    const metadataPath = path.join(METADATA_DIR, metadataFilename);
    
    const metadata = {
      meetingId: id,
      meetingTitle: title,
      meetingDate: startDate,
      extractedAt: new Date().toISOString(),
      ...agendaData,
      skipDownload
    };
    
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`Saved agenda metadata to: ${metadataPath}`);
    
    // Generate and save YouTube chapters
    const chaptersText = generateYouTubeChapters(meeting, agendaData);
    
    if (chaptersText) {
      const chaptersFilename = `${safeDate}_${safeTitle}_youtube_chapters.txt`;
      const chaptersPath = path.join(CHAPTERS_DIR, chaptersFilename);
      
      await fs.writeFile(chaptersPath, chaptersText);
      console.log(`Generated YouTube chapters at: ${chaptersPath}`);
    }
    
    return {
      metadataPath,
      chaptersText
    };
  } catch (error) {
    console.error('Error saving metadata:', error);
    throw error;
  }
}

/**
 * Process a single meeting - extract metadata, download video, generate chapters
 */
async function processMeeting(meeting, options = {}) {
  const { skipDownload = false } = options;
  const { title, id } = meeting;
  
  try {
    console.log(`\nProcessing meeting: ${title} (${id})`);
    console.log('--------------------------------------');
    
    // Step 1: Extract agenda items with timestamps
    console.log('Extracting agenda data...');
    const agendaData = await extractAgendaWithTimestamps(id);
    
    // Step 2: Save metadata and generate chapters
    console.log('Saving metadata and generating chapters...');
    const { metadataPath, chaptersText } = await saveMetadata(meeting, agendaData, { skipDownload });
    
    // Step 3: Download the video (unless skipped)
    let downloadResult = null;
    if (!skipDownload) {
      console.log('Downloading video...');
      downloadResult = await downloadMeeting(meeting);
    } else {
      console.log('Video download skipped.');
    }
    
    return {
      meeting,
      metadataPath,
      downloadResult,
      chaptersText,
      agendaItemsCount: agendaData.agendaItems.length
    };
  } catch (error) {
    console.error(`Error processing meeting ${title}:`, error);
    throw error;
  }
}

/**
 * Load processed meetings from the manifest file
 * @returns {Promise<Object>} - The processed meetings manifest
 */
async function loadProcessedMeetingsManifest() {
  const manifestPath = path.join(DOWNLOAD_DIR, 'processed-meetings.json');
  
  try {
    // Ensure the directory exists
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    
    // Check if manifest exists
    try {
      await fs.access(manifestPath);
    } catch (error) {
      // Create a new manifest if it doesn't exist
      const newManifest = {
        processedMeetings: [],
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(manifestPath, JSON.stringify(newManifest, null, 2));
      console.log(`Created new processed meetings manifest at: ${manifestPath}`);
      return newManifest;
    }
    
    // Read and parse the manifest
    const manifestData = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(manifestData);
  } catch (error) {
    console.error('Error loading processed meetings manifest:', error);
    // Return empty manifest on error
    return {
      processedMeetings: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Save updated processed meetings manifest
 * @param {Object} manifest - The manifest to save
 */
async function saveProcessedMeetingsManifest(manifest) {
  const manifestPath = path.join(DOWNLOAD_DIR, 'processed-meetings.json');
  
  try {
    // Update last updated timestamp
    manifest.lastUpdated = new Date().toISOString();
    
    // Write the manifest
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Updated processed meetings manifest at: ${manifestPath}`);
  } catch (error) {
    console.error('Error saving processed meetings manifest:', error);
    throw error;
  }
}

/**
 * Check if a meeting has already been processed successfully
 * @param {string} meetingId - The meeting ID to check
 * @param {Object} manifest - The processed meetings manifest
 * @returns {boolean} - True if the meeting has been processed, false otherwise
 */
function isMeetingProcessed(meetingId, manifest) {
  return manifest.processedMeetings.some(m => m.id === meetingId && m.success);
}

/**
 * Filter out already processed meetings
 * @param {Array<Object>} meetings - List of meetings to filter
 * @param {Object} manifest - The processed meetings manifest
 * @param {boolean} forceReprocess - Whether to force reprocessing of meetings
 * @returns {Array<Object>} - Filtered list of meetings
 */
function filterProcessedMeetings(meetings, manifest, forceReprocess) {
  if (forceReprocess) {
    console.log('Force reprocess flag set. Processing all meetings regardless of status.');
    return meetings;
  }
  
  const newMeetings = meetings.filter(meeting => !isMeetingProcessed(meeting.id, manifest));
  console.log(`Found ${newMeetings.length} new meetings out of ${meetings.length} total.`);
  return newMeetings;
}

/**
 * Main function to process meetings based on command line arguments
 */
async function main() {
  try {
    // Create required directories
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    await fs.mkdir(METADATA_DIR, { recursive: true });
    await fs.mkdir(CHAPTERS_DIR, { recursive: true });
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const options = {
      skipDownload: args.includes('--no-download'),
      forceReprocess: args.includes('--force'),
      startDate: null,
      endDate: null
    };
    
    // Get start and end dates from arguments
    const startDateArg = args.find(arg => arg.startsWith('--start='));
    const endDateArg = args.find(arg => arg.startsWith('--end='));
    
    if (startDateArg) {
      options.startDate = startDateArg.replace('--start=', '');
    }
    
    if (endDateArg) {
      options.endDate = endDateArg.replace('--end=', '');
    }
    
    console.log(`Running with options: ${JSON.stringify(options, null, 2)}`);
    
    // Load processed meetings manifest
    const manifest = await loadProcessedMeetingsManifest();
    console.log(`Loaded manifest with ${manifest.processedMeetings.length} previously processed meetings.`);
    
    // Fetch meetings with video
    const allMeetings = await fetchMeetingsWithVideo(options.startDate, options.endDate);
    
    // Filter out already processed meetings
    const meetings = filterProcessedMeetings(allMeetings, manifest, options.forceReprocess);
    
    if (meetings.length === 0) {
      console.log('No new meetings to process. Exiting.');
      return [];
    }
    
    // Process each meeting
    const results = [];
    for (const meeting of meetings) {
    
      let manEntry = {
        id: meeting.id,
        title: meeting.title,
        date: meeting.startDate,
        processedAt: new Date().toISOString(),
        uploaded: 'no', // no, yes, error
        youtubeUrl: undefined,
        success: false,
      }

      try {
        const result = await processMeeting(meeting, options);
        
        // Add to results
        const meetingResult = {
          meetingId: meeting.id,
          title: meeting.title,
          date: meeting.startDate,
          agendaItemsCount: result.agendaItemsCount,
          success: true,
          chaptersAvailable: !!result.chaptersText,
          processedAt: new Date().toISOString()
        };

        // we successfully downloaded and processed the video
        manEntry.success = true

        // now upload
        try {
          const title = `${meeting.title} - ${formatMeetingDate(meeting.startDate)} | GNV FL`
          
          // Determine which playlists to add the video to
          const playlistIds = determinePlaylistIds(meeting.title);
          if (playlistIds.length > 0) {
            console.log(`Adding video to playlists: ${playlistIds.join(', ')}`);
          } else {
            console.log(`No matching playlists found for meeting: ${meeting.title}`);
          }

          const ytResult = await uploadToYouTube({
            videoPath: result.downloadResult.outputPath,
            title, 
            description: result.chaptersText,
            tags: ['Gainesville'],
            privacyStatus: 'public',
            playlistIds
          })

          // then mark it as uploaded
          manEntry = {
            ...manEntry, 
            uploaded: true, 
            youtubeUrl: ytResult.url,
            playlistIds,
            playlistResults: ytResult.playlistResults
          }

          results.push(meetingResult);
        } catch(err) {
          // mark it as processed but error upload
        }
      } catch (error) {
        console.error(`Failed to process meeting ${meeting.title}:`, error);
        // this is problematic bc it will add a duplicate entry if it exists
        // we are filtering out already existing manifest entries, but still
        results.push({
          meetingId: meeting.id,
          title: meeting.title,
          date: meeting.startDate,
          success: false,
          error: error.message,
          processedAt: new Date().toISOString()
        });

        manEntry = {...manEntry, success: false, error: error.message}

      } finally {
        // Add to processed meetings manifest
        manifest.processedMeetings.push(manEntry);
        // Save manifest after each successful processing
        await saveProcessedMeetingsManifest(manifest);
      }
    }

    // Log summary
    console.log('\nSummary:');
    console.log(`Total meetings processed: ${results.length}`);
    console.log(`Successful: ${results.filter(r => r.success).length}`);
    console.log(`Failed: ${results.filter(r => !r.success).length}`);
    // console.log(`Meetings with chapters: ${results.filter(r => r.chaptersAvailable).length}`);

    return results;
  } catch (error) {
    console.error('Error in main:', error);
    throw error;
  }
}

// Run the program if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export functions for use in other modules
export {
  fetchMeetingsWithVideo,
  extractAgendaWithTimestamps,
  generateYouTubeChapters,
  downloadMeeting,
  processMeeting
};
