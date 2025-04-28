const BASE_URL = process.env.BASE_URL ?? 'https://pub-cityofgainesville.escribemeetings.com';
const API_URL = `${BASE_URL}/MeetingsCalendarView.aspx/GetAllMeetings`;

// Helper to get the first/last day of the current month
function getCurrentMonthDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const toISOStringWithOffset = (date) =>
    // idk if this offset is needed or not
    date.toISOString().replace('Z', '-04:00');

  return {
    start: toISOStringWithOffset(start),
    end: toISOStringWithOffset(end),
  };
}

async function fetchMeetingsWithVideo() {
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

  const meetingsWithVideo = meetings
    .filter((meeting) => meeting.HasVideo)
    .map((meeting) => ({
      title: meeting.MeetingName,
      meetingUrl: `${BASE_URL}/Meeting.aspx?Id=${meeting.ID}`,
    }));

  return meetingsWithVideo;
}

async function main() {
  const meetings = await fetchMeetingsWithVideo();
  // just log em for now
  console.log(meetings);
}

main().catch(console.error);

