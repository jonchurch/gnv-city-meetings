import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { processMeetingAgenda } from './agenda-parser.js';

const BASE_URL = 'https://pub-cityofgainesville.escribemeetings.com';
const API_URL = `${BASE_URL}/MeetingsCalendarView.aspx/GetAllMeetings`;
const DOWNLOAD_DIR = './downloads';
const YTDLP_PATH = '/Users/jon/Spoons/yt-dlp/yt_dlp/__main__.py';

const execAsync = promisify(exec);

function sanitizeFilename(name) {
  return name.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
}

function getCurrentMonthDateRange() {
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

export async function fetchMeetingsWithVideo() {
  const { start, end } = getCurrentMonthDateRange();

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

  return meetings
    .filter((meeting) => meeting.HasVideo)
    .map((meeting) => ({
      title: meeting.MeetingName,
      meetingUrl: `${BASE_URL}/Meeting.aspx?Id=${meeting.ID}`,
      startDate: meeting.StartDate,
      id: meeting.ID
    }));
}

async function downloadMeeting({ title, meetingUrl, startDate }) {
  const safeTitle = sanitizeFilename(title);
  const safeDate = startDate.split(' ')[0].replace(/\//g, '-');
  const filename = `${safeDate}_${safeTitle}`;
  const outputPath = path.join(DOWNLOAD_DIR, `${filename}.%(ext)s`);

  const cmd = `python3 "${YTDLP_PATH}" "${meetingUrl}" --output "${outputPath}"`;

  console.log(`Downloading "${filename}"...`);
  try {
    const { stdout, stderr } = await execAsync(cmd);
    console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (err) {
    console.error(`Error handling ${title}:`, err.stderr || err);
  }
}

async function main() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  const meetings = await fetchMeetingsWithVideo();
  console.log(`Found ${meetings.length} meetings with video.`);

  for (const meeting of meetings) {
    // Extract agenda with timestamps
    try {
      await processMeetingAgenda(meeting);
    } catch (error) {
      console.error(`Failed to process agenda for ${meeting.title}:`, error);
    }
    
    // Download the video
    await downloadMeeting(meeting);
  }
}

main().catch(console.error);
