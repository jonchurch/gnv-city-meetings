#!/usr/bin/env node
import { parseArgs } from 'util';
import { initializeDatabase, insertMeeting, getMeeting } from './db/init.js';
import { createQueue } from './queue/config.js';
import { QUEUE_NAMES } from './workflow/config.js';
import 'dotenv/config';

const BASE_URL = 'https://pub-cityofgainesville.escribemeetings.com';
const API_URL = `${BASE_URL}/MeetingsCalendarView.aspx/GetCalendarMeetings`;

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

async function fetchMeetingsWithVideo(startDate, endDate) {
  const { start, end } = getDateRange(startDate, endDate);
  console.log(JSON.stringify({ 
    message: 'Fetching meetings', 
    start, 
    end,
    step: 'discovery'
  }));

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
      id: meeting.ID,
      title: meeting.MeetingName,
      meeting_url: `${BASE_URL}/Meeting.aspx?Id=${meeting.ID}`,
      date: meeting.StartDate,
      has_video: true
    }));

  console.log(JSON.stringify({
    message: 'Found meetings with video',
    count: meetingsWithVideo.length,
    step: 'discovery'
  }));
  
  return meetingsWithVideo;
}

export async function runDiscovery(options = {}) {
  const { 
    startDate = null, 
    endDate = null 
  } = options;

  let queue = null;
  
  try {
    const db = await initializeDatabase();
    queue = createQueue(QUEUE_NAMES.DOWNLOAD);
    
    const meetings = await fetchMeetingsWithVideo(startDate, endDate);
    
    let newMeetingsCount = 0;
    let existingMeetingsCount = 0;
    let enqueuedCount = 0;
    
    for (const meeting of meetings) {
      const existing = await getMeeting(db, meeting.id);
      
      if (!existing) {
        await insertMeeting(db, meeting);
        newMeetingsCount++;
        console.log(JSON.stringify({
          message: 'Inserted new meeting',
          meeting_id: meeting.id,
          title: meeting.title,
          date: meeting.date,
          step: 'discovery'
        }));
        
        // Enqueue for download (first step in workflow)
        await queue.add('process', { meetingId: meeting.id }, {
          jobId: `download-${meeting.id}`,
        });
        enqueuedCount++;
        console.log(JSON.stringify({
          message: 'Enqueued meeting for download',
          meeting_id: meeting.id,
          queue: QUEUE_NAMES.DOWNLOAD,
          step: 'enqueue'
        }));
      } else {
        existingMeetingsCount++;
      }
    }
    
    console.log(JSON.stringify({
      message: 'Discovery complete',
      new_meetings: newMeetingsCount,
      existing_meetings: existingMeetingsCount,
      enqueued: enqueuedCount,
      total_found: meetings.length,
      step: 'discovery'
    }));
    
    await db.close();
    await queue.close();
    
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Discovery error',
      error: error.message,
      stack: error.stack,
      step: 'discovery'
    }));
    if (queue) await queue.close();
    process.exit(1);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      from: {
        type: 'string',
        short: 'f'
      },
      to: {
        type: 'string',
        short: 't'
      },
      help: {
        type: 'boolean',
        short: 'h'
      }
    },
    allowPositionals: false
  });

  if (values.help) {
    console.log(`
Discovery service for GNV City Meetings

Usage: ./discover.js [options]

Options:
  -f, --from DATE         Start date for discovery (YYYY-MM-DD)
  -t, --to DATE           End date for discovery (YYYY-MM-DD)
  -h, --help              Show this help

Examples:
  ./discover.js                           # Discover current month
  ./discover.js --from=2024-01-01         # Discover from date to current month end
  ./discover.js --from=2024-01-01 --to=2024-01-31
    `);
    return;
  }

  await runDiscovery({ 
    startDate: values.from, 
    endDate: values.to
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}