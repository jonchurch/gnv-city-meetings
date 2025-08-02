import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initializeDatabase() {
  const db = await open({
    filename: path.join(__dirname, '../meetings.db'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'DISCOVERED',
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      meeting_url TEXT,
      has_video BOOLEAN DEFAULT 1,
      video_path TEXT,
      agenda_data TEXT,
      chapters_text TEXT,
      youtube_url TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_meetings_state ON meetings(state);
    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
  `);

  return db;
}

export async function getMeeting(db, meetingId) {
  return await db.get('SELECT * FROM meetings WHERE id = ?', meetingId);
}

export async function getMeetingsByState(db, state) {
  return await db.all('SELECT * FROM meetings WHERE state = ?', state);
}

export async function getMeetingsToProcess(db) {
  return await db.all(`
    SELECT * FROM meetings 
    WHERE state IN ('DISCOVERED', 'FAILED') 
    ORDER BY date DESC
  `);
}

export async function insertMeeting(db, meeting) {
  const { id, title, date, meeting_url, has_video } = meeting;
  
  const result = await db.run(`
    INSERT OR IGNORE INTO meetings (id, title, date, meeting_url, has_video)
    VALUES (?, ?, ?, ?, ?)
  `, id, title, date, meeting_url, has_video ? 1 : 0);
  
  return result;
}

export async function updateMeetingState(db, meetingId, state, additionalData = {}) {
  const updates = ['state = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const values = [state];
  
  if (additionalData.video_path) {
    updates.push('video_path = ?');
    values.push(additionalData.video_path);
  }
  
  if (additionalData.agenda_data) {
    updates.push('agenda_data = ?');
    values.push(JSON.stringify(additionalData.agenda_data));
  }
  
  if (additionalData.chapters_text) {
    updates.push('chapters_text = ?');
    values.push(additionalData.chapters_text);
  }
  
  if (additionalData.youtube_url) {
    updates.push('youtube_url = ?');
    values.push(additionalData.youtube_url);
  }
  
  if (additionalData.error) {
    updates.push('error = ?');
    values.push(additionalData.error);
  }
  
  values.push(meetingId);
  
  const sql = `UPDATE meetings SET ${updates.join(', ')} WHERE id = ?`;
  const result = await db.run(sql, ...values);
  
  return result;
}

export const MeetingStates = {
  DISCOVERED: 'DISCOVERED',
  DOWNLOADING: 'DOWNLOADING',
  PROCESSING: 'PROCESSING',
  UPLOADING: 'UPLOADING',
  UPLOADED: 'UPLOADED',
  DIARIZING: 'DIARIZING',
  DIARIZED: 'DIARIZED',
  FAILED: 'FAILED'
};