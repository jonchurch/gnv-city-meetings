#!/usr/bin/env node
import { initializeDatabase, insertMeeting, getMeeting } from './db/init.js';
import 'dotenv/config';

const BASE_URL = 'https://pub-cityofgainesville.escribemeetings.com';
const API_URL = `${BASE_URL}/MeetingsCalendarView.aspx/GetAllMeetings`;

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

async function main() {
  const args = process.argv.slice(2);
  const startDateArg = args.find(arg => arg.startsWith('--from='));
  const endDateArg = args.find(arg => arg.startsWith('--to='));
  const enqueueOnly = args.includes('--enqueue-only');
  
  let startDate = null;
  let endDate = null;
  
  if (startDateArg) {
    startDate = startDateArg.replace('--from=', '');
  }
  
  if (endDateArg) {
    endDate = endDateArg.replace('--to=', '');
  }

  try {
    const db = await initializeDatabase();
    
    const meetings = await fetchMeetingsWithVideo(startDate, endDate);
    
    let newMeetingsCount = 0;
    let existingMeetingsCount = 0;
    
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
      } else {
        existingMeetingsCount++;
      }
    }
    
    console.log(JSON.stringify({
      message: 'Discovery complete',
      new_meetings: newMeetingsCount,
      existing_meetings: existingMeetingsCount,
      total_found: meetings.length,
      step: 'discovery'
    }));
    
    await db.close();
    
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Discovery error',
      error: error.message,
      stack: error.stack,
      step: 'discovery'
    }));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}