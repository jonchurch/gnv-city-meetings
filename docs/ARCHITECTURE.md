# Technical Architecture

## System Overview

The Gainesville City Meetings Pipeline is a stateful ETL system designed for reliable processing of municipal video content at scale.

## Design Principles

### 1. State-First Architecture
- **SQLite Database**: Single source of truth for processing state
- **Idempotent Operations**: All operations can be safely retried
- **Recovery by Design**: System can resume from any failure point

### 2. Job Queue Pattern
- **File-Based Queue**: Simple, visible, debuggable job persistence
- **Database Backing**: Reliable state tracking with atomic updates
- **Worker Isolation**: Each job type processed by specialized workers

### 3. Separation of Concerns
- **Discovery**: Calendar polling and meeting identification
- **Extraction**: Video download and metadata parsing
- **Transformation**: Chapter generation and content formatting
- **Loading**: YouTube upload and playlist management

## Data Model

### Core Entities

```sql
-- Primary entity representing a city meeting
meetings (
  id TEXT PRIMARY KEY,           -- Escribe meeting UUID
  title TEXT,                    -- "City Commission - Regular Meeting"
  date TEXT,                     -- ISO date string
  meeting_url TEXT,              -- Escribe meeting page URL
  status TEXT,                   -- Pipeline stage indicator
  download_path TEXT,            -- Local video file path
  metadata_path TEXT,            -- Local agenda JSON path
  youtube_url TEXT,              -- Published video URL
  playlist_ids TEXT,             -- JSON array of target playlists
  retry_count INTEGER,           -- Failure recovery tracking
  last_error TEXT,               -- Most recent error message
  created_at DATETIME,           -- Discovery timestamp
  updated_at DATETIME            -- Last state change
);

-- Job queue for async processing
jobs (
  id INTEGER PRIMARY KEY,
  meeting_id TEXT REFERENCES meetings(id),
  type TEXT,                     -- 'download' | 'upload'
  status TEXT,                   -- 'pending' | 'processing' | 'completed' | 'failed'
  payload TEXT,                  -- JSON serialized job data
  created_at DATETIME,
  updated_at DATETIME
);
```

### State Transitions

```
Meeting Lifecycle:
discovered → downloading → downloaded → uploading → uploaded
    ↓              ↓            ↓           ↓
  failed       failed       failed      failed

Job Lifecycle:
pending → processing → completed
   ↓           ↓
 failed    failed
```

## Component Architecture

### Database Layer (`src/lib/database.js`)

**Responsibilities:**
- Schema definition and migration
- CRUD operations for meetings and jobs
- Transaction management
- Connection pooling and cleanup

**Key Functions:**
- `upsertMeeting()`: Idempotent meeting record creation
- `updateMeetingStatus()`: Atomic state transitions
- `getPipelineStats()`: Observability metrics

### Job Queue (`src/queue/job-manager.js`)

**Responsibilities:**
- Job creation and persistence
- Work distribution to processors
- Failure handling and retry logic
- Queue monitoring and cleanup

**Implementation Details:**
- **File Storage**: Jobs persisted as JSON files for visibility
- **Atomic Operations**: File moves for state changes
- **Directory Structure**: `pending/`, `processing/`, `completed/`, `failed/`
- **Idempotency**: Jobs can be safely replayed

### Workers (`src/workers/`)

**Design Pattern:** Single Responsibility Principle
- Each worker handles one job type
- Stateless operation with database coordination
- Error isolation prevents cascade failures

#### Calendar Poller
- Queries Escribe API for meeting listings
- Identifies meetings with video content
- Creates discovery records and download jobs

#### Downloader
- Processes download jobs from queue
- Extracts video files using yt-dlp
- Parses agenda metadata from meeting pages
- Generates YouTube chapter descriptions
- Creates upload jobs for successful downloads

#### Uploader
- Processes upload jobs from queue
- Publishes videos to YouTube with metadata
- Assigns videos to appropriate playlists
- Updates final success state

### CLI Interface (`src/cli/`)

**Philosophy:** Unix-style single-purpose tools
- `status.js`: Pipeline monitoring and metrics
- `pipeline.js`: Orchestration and batch processing
- `backfill.js`: Historical data processing

## Data Flow

### 1. Discovery Phase
```
Escribe Calendar API → Meeting Records → Download Jobs
```

- Poll calendar API for date ranges
- Filter for meetings with video content
- Upsert meeting records (idempotent)
- Create download jobs for new meetings

### 2. Processing Phase
```
Download Jobs → Video Files + Metadata → Upload Jobs
```

- Fetch video URLs from meeting pages
- Download video files using yt-dlp
- Extract agenda items with timestamps
- Generate YouTube chapter descriptions
- Create upload jobs for successful downloads

### 3. Publishing Phase
```
Upload Jobs → YouTube Videos → Playlist Assignment
```

- Upload videos with generated metadata
- Assign to playlists based on meeting type
- Update meeting records with YouTube URLs
- Mark pipeline completion

## Error Handling Strategy

### Retry Logic
- **Exponential Backoff**: Prevents API rate limiting
- **Maximum Attempts**: Configurable retry limits
- **Error Classification**: Different strategies for different failure types

### Failure Isolation
- **Job-Level Failures**: Don't block other processing
- **Partial Success**: Completed stages persist through failures
- **Recovery Points**: Clear restart positions for failed operations

### Observability
- **Error Logging**: Detailed failure information persistence
- **Status Tracking**: Real-time pipeline state visibility
- **Metrics Collection**: Processing rates and success statistics

## Scalability Considerations

### Current Scale
- **Data Volume**: ~600-700 meetings processed historically
- **Processing Rate**: ~10-20 meetings per batch
- **Storage**: ~300GB video content (with cleanup)

### Growth Accommodations
- **Horizontal Scaling**: Multiple workers can process jobs concurrently
- **Storage Management**: Configurable cleanup policies
- **Rate Limiting**: API throttling and backoff strategies

### Performance Optimizations
- **Batch Processing**: Group operations for efficiency
- **Concurrent Downloads**: Parallel video extraction
- **Database Indexing**: Optimized queries for status and date ranges

## Configuration Management

### Environment Variables
```bash
# External API Configuration
YTDLP_PATH=/path/to/yt-dlp           # Video download tool
GOOGLE_CLIENT_ID=oauth_client_id      # YouTube API access
GOOGLE_CLIENT_SECRET=oauth_secret     # YouTube API access

# Content Organization
PLAYLIST_CITY_COMMISSION=playlist_id  # Meeting type → Playlist mapping
PLAYLIST_GENERAL_POLICY=playlist_id
PLAYLIST_CITY_PLAN_BOARD=playlist_id
```

### Operational Parameters
- **Retry Limits**: Maximum failure attempts before abandonment
- **Batch Sizes**: Jobs processed per worker execution
- **Cleanup Policies**: Retention periods for artifacts and logs

## Deployment Considerations

### Dependencies
- **Node.js 22+**: ES modules and modern JavaScript features
- **SQLite3**: Embedded database for state persistence
- **yt-dlp**: Video extraction from Escribe platform
- **Google APIs**: YouTube publishing integration

### Resource Requirements
- **Disk Space**: Variable based on cleanup policies (100GB-1TB+)
- **Memory**: Modest requirements (~100MB base + video processing)
- **CPU**: Download and upload bound, not compute intensive

### Monitoring Points
- **Pipeline Health**: Job queue depth and processing rates
- **Error Rates**: Failure frequency and error classification
- **Resource Usage**: Disk space consumption and cleanup effectiveness

## Future Architecture Considerations

### Potential Enhancements
- **Event-Driven Architecture**: Replace polling with webhook-based discovery
- **Distributed Processing**: Replace file queue with Redis/RabbitMQ
- **Cloud Storage**: S3 integration for video archival
- **API Layer**: REST API for external integrations

### Migration Path
The current architecture supports gradual enhancement:
1. **Database Schema**: Designed for additional metadata fields
2. **Worker Pattern**: New job types can be added incrementally  
3. **Queue System**: File-based queue can be replaced with minimal code changes
4. **CLI Interface**: Additional tools can be added to the toolkit

This architecture prioritizes reliability and maintainability over performance optimization, reflecting the municipal transparency use case where data integrity and system stability are more important than processing speed.