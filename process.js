#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { uploadToYouTube } from './youtube-uploader.js';
import { initializeDatabase, getMeeting, updateMeetingState, MeetingStates } from './db/init.js';
import { pathFor, StorageTypes, ensureStorageDirs } from './storage/paths.js';
import { createQueue, QUEUE_NAMES } from './queue/config.js';
import 'dotenv/config';

const BASE_URL = 'https://pub-cityofgainesville.escribemeetings.com';
const YTDLP_PATH = process.env.YTDLP_PATH || '/Users/jon/Spoons/yt-dlp/yt_dlp/__main__.py';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sanitizeFilename(name) {
  return name.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
}

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

async function extractAgendaWithTimestamps(meetingId) {
  try {
    const meetingUrl = `${BASE_URL}/Meeting.aspx?Id=${meetingId}&Agenda=Agenda&lang=English`;
    console.log(JSON.stringify({
      message: 'Fetching agenda',
      meeting_id: meetingId,
      url: meetingUrl,
      step: 'agenda_extraction'
    }));
    
    const response = await fetch(meetingUrl);
    const html = await response.text();
    
    const bookmarksMatch = html.match(/Bookmarks\s*:\s*\[(.*?)\]/s);
    
    if (!bookmarksMatch || !bookmarksMatch[1]) {
      console.log(JSON.stringify({
        message: 'No bookmarks found',
        meeting_id: meetingId,
        step: 'agenda_extraction'
      }));
      return { meetingId, agendaItems: [] };
    }
    
    const bookmarksJson = `[${bookmarksMatch[1]}]`;
    const bookmarks = JSON.parse(bookmarksJson);
    
    const agendaItems = [];
    const itemMatches = html.matchAll(/<DIV class=['"]AgendaItem AgendaItem(\d+)['"].*?<DIV class=['"]AgendaItemTitle['"].*?><a.*?>(.*?)<\/a>/gs);
    
    for (const match of itemMatches) {
      const itemId = parseInt(match[1], 10);
      const itemTitle = match[2].trim();
      
      const bookmark = bookmarks.find(b => b.AgendaItemId === itemId);
      
      if (bookmark) {
        agendaItems.push({
          id: itemId,
          title: itemTitle,
          timeStart: bookmark.TimeStart,
          timeEnd: bookmark.TimeEnd,
          startTime: formatTime(bookmark.TimeStart),
          endTime: formatTime(bookmark.TimeEnd),
          durationSeconds: Math.floor((bookmark.TimeEnd - bookmark.TimeStart) / 1000)
        });
      } else {
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
    
    agendaItems.sort((a, b) => (a.timeStart || Infinity) - (b.timeStart || Infinity));
    
    return {
      meetingId,
      agendaItems,
      rawBookmarks: bookmarks
    };
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Agenda extraction error',
      meeting_id: meetingId,
      error: error.message,
      step: 'agenda_extraction'
    }));
    throw error;
  }
}

function generateYouTubeChapters(meeting, agendaData) {
  const { title: meetingTitle, date } = meeting;
  const { agendaItems } = agendaData;
  
  const chaptersItems = agendaItems
    .filter(item => item.timeStart !== null)
    .sort((a, b) => a.timeStart - b.timeStart);
  
  if (chaptersItems.length === 0) {
    console.log(JSON.stringify({
      message: 'No timestamped agenda items',
      meeting_id: meeting.id,
      step: 'chapter_generation'
    }));
    return '';
  }
  
  const formattedDate = date.split(' ')[0].replace(/\//g, '-');
  
  let chaptersText = `${meetingTitle} - ${formattedDate}\n\n`;
  chaptersText += 'Chapters:\n';
  
  for (const item of chaptersItems) {
    if (item === chaptersItems[0] && item.startTime !== '00:00:00') {
      chaptersText += `00:00:00 Pre-meeting\n`;
    }
    
    chaptersText += `${item.startTime} ${item.title}\n`;
  }
  
  return chaptersText;
}

async function downloadMeeting(meeting) {
  const { id, meeting_url } = meeting;
  const outputPath = pathFor(StorageTypes.RAW_VIDEO, id);

  const cmd = YTDLP_PATH.includes('/') ? 
    `python3 "${YTDLP_PATH}" "${meeting_url}" --output "${outputPath}"` :
    `${YTDLP_PATH} "${meeting_url}" --output "${outputPath}"`;

  console.log(JSON.stringify({
    message: 'Downloading video',
    meeting_id: id,
    output_path: outputPath,
    step: 'download'
  }));
  
  try {
    const { stdout, stderr } = await execAsync(cmd);
    if (stderr) {
      console.error(JSON.stringify({
        message: 'Download stderr',
        meeting_id: id,
        stderr,
        step: 'download'
      }));
    }
    
    return {
      meetingId: id,
      outputPath
    };
  } catch (err) {
    console.error(JSON.stringify({
      message: 'Download error',
      meeting_id: id,
      error: err.message,
      stderr: err.stderr,
      step: 'download'
    }));
    throw err;
  }
}

async function processMeeting(meetingId) {
  const db = await initializeDatabase();
  
  try {
    const meeting = await getMeeting(db, meetingId);
    
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found in database`);
    }
    
    console.log(JSON.stringify({
      message: 'Processing meeting',
      meeting_id: meetingId,
      title: meeting.title,
      state: meeting.state,
      step: 'process_start'
    }));
    
    await updateMeetingState(db, meetingId, MeetingStates.PROCESSING);
    
    const agendaData = await extractAgendaWithTimestamps(meetingId);
    
    const chaptersText = generateYouTubeChapters(meeting, agendaData);
    
    // Save chapters to deterministic location
    const chaptersPath = pathFor(StorageTypes.DERIVED_CHAPTERS, meetingId);
    await fs.writeFile(chaptersPath, chaptersText);
    
    // Save metadata to deterministic location
    const metadataPath = pathFor(StorageTypes.DERIVED_METADATA, meetingId);
    await fs.writeFile(metadataPath, JSON.stringify({
      meetingId,
      title: meeting.title,
      date: meeting.date,
      agendaData,
      extractedAt: new Date().toISOString()
    }, null, 2));
    
    await updateMeetingState(db, meetingId, MeetingStates.DOWNLOADING, {
      agenda_data: agendaData,
      chapters_text: chaptersText
    });
    
    const downloadResult = await downloadMeeting(meeting);
    
    await updateMeetingState(db, meetingId, MeetingStates.UPLOADING, {
      video_path: downloadResult.outputPath
    });
    
    const title = `${meeting.title} - ${meeting.date} | GNV FL`;
    
    const ytResult = await uploadToYouTube({
      videoPath: downloadResult.outputPath,
      title,
      description: chaptersText,
      tags: ['Gainesville'],
      privacyStatus: 'unlisted'
    });
    
    await updateMeetingState(db, meetingId, MeetingStates.UPLOADED, {
      youtube_url: ytResult.url
    });
    
    // Enqueue for diarization
    const diarizeQueue = createQueue(QUEUE_NAMES.DIARIZE);
    await diarizeQueue.add('diarize', { meetingId }, {
      jobId: `diarize-${meetingId}`,
    });
    await diarizeQueue.close();
    
    console.log(JSON.stringify({
      message: 'Meeting processed successfully',
      meeting_id: meetingId,
      youtube_url: ytResult.url,
      enqueued_for_diarization: true,
      step: 'process_complete'
    }));
    
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Processing error',
      meeting_id: meetingId,
      error: error.message,
      stack: error.stack,
      step: 'process_error'
    }));
    
    await updateMeetingState(db, meetingId, MeetingStates.FAILED, {
      error: error.message
    });
    
    throw error;
  } finally {
    await db.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node process.js <meeting_id>');
    process.exit(1);
  }
  
  const meetingId = args[0];
  
  // Ensure all storage directories exist
  await ensureStorageDirs();
  
  try {
    await processMeeting(meetingId);
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}