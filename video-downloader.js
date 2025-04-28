// Video downloader script - downloads videos that have been identified but not yet downloaded
// Uses the custom fork of yt-dlp to download the videos

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, 'downloads', 'processed-meetings.json');
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

/**
 * Download a meeting video using yt-dlp
 * @param {Object} meeting - Meeting object from the manifest
 */
async function downloadMeeting(meeting) {
  try {
    const { id, title, date } = meeting;
    console.log(`Downloading meeting: ${title} (${date})`);
    
    // Format safe filename
    const safeDate = date.split(' ')[0].replace(/\//g, '-');
    const safeTitle = title.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
    const filename = `${safeDate}_${safeTitle}`;
    const outputPath = path.join(DOWNLOAD_DIR, `${filename}.%(ext)s`);
    
    // Get the yt-dlp executable path from environment variable or use default
    const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
    const meetingUrl = `https://pub-cityofgainesville.escribemeetings.com/Meeting.aspx?Id=${id}`;
    
    console.log(`Using yt-dlp from: ${ytdlpPath}`);
    const cmd = `${ytdlpPath} "${meetingUrl}" --output "${outputPath}"`;
    
    // Execute the download command
    const { stdout, stderr } = await execAsync(cmd);
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    // Verify the downloaded file exists
    const files = await fs.readdir(DOWNLOAD_DIR);
    const downloadedFile = files.find(file => 
      file.startsWith(filename) && 
      !file.endsWith('.json') &&
      !file.endsWith('_agenda.json') &&
      !file.endsWith('_youtube_chapters.txt')
    );
    
    if (!downloadedFile) {
      throw new Error(`Download completed but could not find downloaded file for ${filename}`);
    }
    
    console.log(`Successfully downloaded: ${downloadedFile}`);
    
    return {
      id,
      title,
      date,
      success: true,
      downloadedAt: new Date().toISOString(),
      videoFile: downloadedFile
    };
  } catch (error) {
    console.error(`Error downloading meeting ${meeting.title}:`, error);
    return {
      ...meeting,
      success: false,
      downloadError: error.message
    };
  }
}

/**
 * Find meetings that have been processed but not downloaded and download them
 */
async function downloadPendingMeetings() {
  try {
    // Read the manifest file
    const manifestData = await fs.readFile(MANIFEST_PATH, 'utf8');
    const manifest = JSON.parse(manifestData);
    
    // Create download directory if it doesn't exist
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    
    // Find meetings that have been processed (metadata extracted) but not downloaded
    // Filter out meetings that had download errors to avoid retrying repeatedly
    const pendingMeetings = manifest.processedMeetings.filter(
      meeting => 
        !meeting.downloadedAt && 
        meeting.success && 
        !meeting.downloadError
    );
    
    console.log(`Found ${pendingMeetings.length} meetings to download`);
    
    // Download each meeting one by one
    for (const meeting of pendingMeetings) {
      const result = await downloadMeeting(meeting);
      
      // Update the meeting in the manifest
      const index = manifest.processedMeetings.findIndex(m => m.id === meeting.id);
      if (index !== -1) {
        manifest.processedMeetings[index] = {
          ...manifest.processedMeetings[index],
          downloadedAt: result.success ? result.downloadedAt : undefined,
          videoFile: result.success ? result.videoFile : undefined,
          downloadError: result.success ? undefined : result.downloadError
        };
        
        // Save the updated manifest
        manifest.lastUpdated = new Date().toISOString();
        await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
        console.log(`Updated manifest for meeting: ${meeting.title}`);
      }
    }
    
    console.log('All pending meetings downloaded successfully');
  } catch (error) {
    console.error('Error downloading meetings:', error);
    process.exit(1);
  }
}

// Run the script
downloadPendingMeetings().catch(console.error);