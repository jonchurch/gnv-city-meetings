# Database Schema Documentation

## Overview

The pipeline uses SQLite for state management and job queue persistence. The database serves as the single source of truth for processing status and recovery operations.

## Schema Design

### Core Tables

#### `meetings` Table

Primary entity representing a city meeting discovered from the Escribe calendar.

```sql
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,           -- Escribe meeting UUID (e.g., "ef143ad1-f36c-4430-818e-58bf286a6c74")
  title TEXT NOT NULL,           -- Meeting name (e.g., "City Commission - Regular Meeting")
  date TEXT NOT NULL,            -- Meeting date in ISO format (e.g., "2025-06-05")
  meeting_url TEXT NOT NULL,     -- Escribe meeting page URL
  status TEXT NOT NULL DEFAULT 'discovered',  -- Current pipeline stage
  download_path TEXT,            -- Local video file path (when downloaded)
  metadata_path TEXT,            -- Local agenda JSON file path
  youtube_url TEXT,              -- Published YouTube video URL
  playlist_ids TEXT,             -- JSON array of target playlist IDs
  retry_count INTEGER DEFAULT 0, -- Number of processing attempts
  last_error TEXT,               -- Most recent error message
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Status Values:**
- `discovered`: Meeting found in calendar, not yet processed
- `downloading`: Video download in progress
- `downloaded`: Video and metadata successfully extracted
- `uploading`: YouTube upload in progress
- `uploaded`: Successfully published to YouTube
- `failed`: Processing failed (check `last_error` and `retry_count`)

#### `jobs` Table

Job queue for asynchronous processing operations.

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT REFERENCES meetings(id),  -- Associated meeting
  type TEXT NOT NULL,            -- Job type: 'download' | 'upload'
  status TEXT NOT NULL DEFAULT 'pending',   -- Job processing status
  payload TEXT,                  -- JSON serialized job parameters
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Job Types:**
- `download`: Extract video and metadata from Escribe
- `upload`: Publish processed video to YouTube

**Job Status Values:**
- `pending`: Job waiting to be processed
- `processing`: Job currently being executed
- `completed`: Job finished successfully
- `failed`: Job processing failed

### Indexes

Performance optimization indexes for common query patterns:

```sql
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_date ON meetings(date);
CREATE INDEX idx_jobs_status_type ON jobs(status, type);
```

## Data Relationships

### Meeting → Jobs Relationship

Each meeting can have multiple associated jobs during its lifecycle:

1. **Discovery**: Meeting record created with `status='discovered'`
2. **Download Job**: Created to extract video and metadata
3. **Upload Job**: Created after successful download

```sql
-- Find all jobs for a specific meeting
SELECT * FROM jobs WHERE meeting_id = 'meeting-uuid-here';

-- Find meetings with pending download jobs
SELECT m.*, j.* 
FROM meetings m 
JOIN jobs j ON m.id = j.meeting_id 
WHERE j.type = 'download' AND j.status = 'pending';
```

## Common Queries

### Pipeline Status Monitoring

```sql
-- Meeting status distribution
SELECT status, COUNT(*) as count 
FROM meetings 
GROUP BY status;

-- Job queue status
SELECT type, status, COUNT(*) as count 
FROM jobs 
GROUP BY type, status;

-- Recent processing activity
SELECT id, title, status, updated_at 
FROM meetings 
ORDER BY updated_at DESC 
LIMIT 20;
```

### Error Analysis

```sql
-- Failed meetings requiring retry
SELECT id, title, retry_count, last_error, updated_at
FROM meetings 
WHERE status = 'failed' AND retry_count < 3
ORDER BY updated_at;

-- Job failure patterns
SELECT type, COUNT(*) as failures
FROM jobs 
WHERE status = 'failed'
GROUP BY type;
```

### Processing Metrics

```sql
-- Upload completion rate
SELECT 
  COUNT(CASE WHEN status = 'uploaded' THEN 1 END) as uploaded,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(CASE WHEN status = 'uploaded' THEN 1 END) / COUNT(*), 2) as success_rate
FROM meetings;

-- Processing throughput by date
SELECT 
  DATE(updated_at) as date,
  COUNT(*) as meetings_processed
FROM meetings 
WHERE status IN ('uploaded', 'failed')
GROUP BY DATE(updated_at)
ORDER BY date DESC;
```

### Data Cleanup

```sql
-- Old completed jobs (for cleanup)
SELECT COUNT(*) 
FROM jobs 
WHERE status = 'completed' 
AND created_at < datetime('now', '-30 days');

-- Orphaned jobs (meetings deleted but jobs remain)
SELECT j.* 
FROM jobs j 
LEFT JOIN meetings m ON j.meeting_id = m.id 
WHERE m.id IS NULL;
```

## Migration and Maintenance

### Schema Evolution

The database is designed to support schema evolution through ALTER TABLE statements:

```sql
-- Example: Adding new fields
ALTER TABLE meetings ADD COLUMN video_duration INTEGER;
ALTER TABLE meetings ADD COLUMN transcript_path TEXT;

-- Example: Adding new job types
-- No schema change needed - job types are dynamic strings
```

### Data Migration

Migration from the legacy manifest system:

```sql
-- Import from processed-meetings.json
INSERT INTO meetings (id, title, date, meeting_url, status)
SELECT 
  manifest_data.id,
  manifest_data.title,
  manifest_data.date,
  'https://pub-cityofgainesville.escribemeetings.com/Meeting.aspx?Id=' || manifest_data.id,
  CASE 
    WHEN manifest_data.uploaded = 'yes' THEN 'uploaded'
    WHEN manifest_data.success = true THEN 'downloaded'
    ELSE 'failed'
  END
FROM manifest_data;
```

### Backup and Recovery

SQLite database backup strategies:

```bash
# Complete database backup
sqlite3 data/meetings.db ".backup backup-$(date +%Y%m%d).db"

# Export to SQL
sqlite3 data/meetings.db ".dump" > backup-$(date +%Y%m%d).sql

# Restore from backup
sqlite3 data/meetings.db ".restore backup-20250623.db"
```

### Performance Tuning

SQLite optimization settings:

```sql
-- Enable WAL mode for better concurrency
PRAGMA journal_mode = WAL;

-- Optimize for read-heavy workloads
PRAGMA cache_size = 10000;

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Analyze query performance
EXPLAIN QUERY PLAN SELECT * FROM meetings WHERE status = 'pending';
```

## Database Operations API

The `src/lib/database.js` module provides a high-level API for database operations:

### Meeting Operations
- `upsertMeeting(meeting)`: Create or update meeting record
- `updateMeetingStatus(id, status, fields)`: Change meeting status
- `getMeetingById(id)`: Retrieve single meeting
- `getMeetingsByStatus(status)`: Query meetings by status

### Job Operations
- `createJob(meetingId, type, payload)`: Create new job
- `getNextJob(type)`: Get next pending job of type
- `updateJobStatus(jobId, status, error)`: Update job status

### Analytics
- `getPipelineStats()`: Overall pipeline metrics
- `getFailedMeetings(maxRetries)`: Meetings eligible for retry

## Data Integrity

### Constraints
- **Primary Keys**: Prevent duplicate meetings and jobs
- **Foreign Keys**: Ensure job → meeting relationships
- **NOT NULL**: Required fields cannot be empty
- **Defaults**: Sensible default values for optional fields

### Validation
- **Status Values**: Application-level validation of enum values
- **JSON Fields**: Proper JSON serialization for complex data
- **Timestamps**: ISO format consistency for date fields

### Recovery
- **Atomic Updates**: All status changes are transactional
- **Idempotent Operations**: Safe to retry any database operation
- **State Consistency**: Database always reflects current processing state

This schema design supports the pipeline's requirements for reliability, observability, and maintainability while remaining simple enough for a single-purpose municipal transparency tool.