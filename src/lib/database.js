import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';

const DB_PATH = path.join(process.cwd(), 'data', 'meetings.db');

let db = null;

/**
 * Initialize database connection and create tables if they don't exist
 */
export async function initDatabase() {
  // Ensure data directory exists
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON');

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      meeting_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'discovered',
      download_path TEXT,
      metadata_path TEXT,
      youtube_url TEXT,
      playlist_ids TEXT, -- JSON array
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id TEXT REFERENCES meetings(id),
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT, -- JSON
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
    CREATE INDEX IF NOT EXISTS idx_jobs_status_type ON jobs(status, type);
  `);

  console.log('Database initialized at:', DB_PATH);
  return db;
}

/**
 * Get database connection (initialize if needed)
 */
export async function getDb() {
  if (!db) {
    await initDatabase();
  }
  return db;
}

/**
 * Insert or update meeting records
 */
export async function upsertMeeting(meeting) {
  const database = await getDb();
  
  const { id, title, startDate: date, meetingUrl: meeting_url } = meeting;
  
  await database.run(`
    INSERT INTO meetings (id, title, date, meeting_url, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      meeting_url = excluded.meeting_url,
      updated_at = CURRENT_TIMESTAMP
  `, [id, title, date, meeting_url]);
}

/**
 * Bulk upsert meetings
 */
export async function upsertMeetings(meetings) {
  const database = await getDb();
  
  await database.exec('BEGIN TRANSACTION');
  try {
    for (const meeting of meetings) {
      await upsertMeeting(meeting);
    }
    await database.exec('COMMIT');
  } catch (error) {
    await database.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Update meeting status and related fields
 */
export async function updateMeetingStatus(meetingId, status, fields = {}) {
  const database = await getDb();
  
  const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const values = [status];
  
  // Add optional fields
  for (const [key, value] of Object.entries(fields)) {
    updates.push(`${key} = ?`);
    values.push(value);
  }
  
  values.push(meetingId);
  
  await database.run(`
    UPDATE meetings 
    SET ${updates.join(', ')}
    WHERE id = ?
  `, values);
}

/**
 * Get meetings by status
 */
export async function getMeetingsByStatus(status) {
  const database = await getDb();
  return await database.all('SELECT * FROM meetings WHERE status = ? ORDER BY date', [status]);
}

/**
 * Get meeting by ID
 */
export async function getMeetingById(id) {
  const database = await getDb();
  return await database.get('SELECT * FROM meetings WHERE id = ?', [id]);
}

/**
 * Check if meeting exists and get its status
 */
export async function getMeetingStatus(id) {
  const database = await getDb();
  const result = await database.get('SELECT status FROM meetings WHERE id = ?', [id]);
  return result?.status || null;
}

/**
 * Get meetings that need to be processed (discovered status)
 */
export async function getUnprocessedMeetings(limit = 50) {
  const database = await getDb();
  return await database.all(
    'SELECT * FROM meetings WHERE status = ? ORDER BY date LIMIT ?', 
    ['discovered', limit]
  );
}

/**
 * Get failed meetings for retry
 */
export async function getFailedMeetings(maxRetries = 3) {
  const database = await getDb();
  return await database.all(
    'SELECT * FROM meetings WHERE status = ? AND retry_count < ? ORDER BY updated_at', 
    ['failed', maxRetries]
  );
}

/**
 * Increment retry count for a meeting
 */
export async function incrementRetryCount(meetingId, error = null) {
  const database = await getDb();
  await database.run(`
    UPDATE meetings 
    SET retry_count = retry_count + 1, 
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [error, meetingId]);
}

/**
 * Get pipeline statistics
 */
export async function getPipelineStats() {
  const database = await getDb();
  
  const stats = await database.all(`
    SELECT status, COUNT(*) as count 
    FROM meetings 
    GROUP BY status
  `);
  
  const totalJobs = await database.get('SELECT COUNT(*) as count FROM jobs');
  const pendingJobs = await database.get('SELECT COUNT(*) as count FROM jobs WHERE status = ?', ['pending']);
  
  return {
    meetings: stats.reduce((acc, { status, count }) => {
      acc[status] = count;
      return acc;
    }, {}),
    jobs: {
      total: totalJobs.count,
      pending: pendingJobs.count
    }
  };
}

/**
 * Create a new job
 */
export async function createJob(meetingId, type, payload = {}) {
  const database = await getDb();
  
  const result = await database.run(`
    INSERT INTO jobs (meeting_id, type, payload)
    VALUES (?, ?, ?)
  `, [meetingId, type, JSON.stringify(payload)]);
  
  return result.lastID;
}

/**
 * Get next pending job of specified type
 */
export async function getNextJob(type) {
  const database = await getDb();
  
  return await database.get(`
    SELECT * FROM jobs 
    WHERE type = ? AND status = 'pending' 
    ORDER BY created_at 
    LIMIT 1
  `, [type]);
}

/**
 * Update job status
 */
export async function updateJobStatus(jobId, status, error = null) {
  const database = await getDb();
  
  await database.run(`
    UPDATE jobs 
    SET status = ?, 
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, error, jobId]);
}

/**
 * Clean up completed jobs older than specified days
 */
export async function cleanupOldJobs(daysOld = 30) {
  const database = await getDb();
  
  const result = await database.run(`
    DELETE FROM jobs 
    WHERE status IN ('completed', 'failed') 
    AND created_at < datetime('now', '-${daysOld} days')
  `);
  
  return result.changes;
}

/**
 * Close database connection
 */
export async function closeDb() {
  if (db) {
    await db.close();
    db = null;
  }
}