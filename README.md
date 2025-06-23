# Gainesville City Meetings Pipeline

A multi-stage pipeline for scraping, processing, and publishing Gainesville city meeting videos to YouTube with automated chapter generation.

## Architecture Overview

This application follows a classic ETL (Extract, Transform, Load) pipeline pattern with job queue orchestration:

```
Calendar Polling → Database → Job Queue → Workers → YouTube
```

### Core Components

- **State Database (SQLite)**: Tracks meeting status and job queue
- **Job Queue**: File-based queue with database backing for reliability
- **Workers**: Specialized processors for each pipeline stage
- **CLI Tools**: Management and monitoring interfaces

### Pipeline Stages

1. **Discovery**: Poll Escribe calendar API for meetings with videos
2. **Download**: Extract meeting videos and agenda metadata
3. **Transform**: Generate YouTube chapters from agenda timestamps
4. **Upload**: Publish to YouTube with metadata and playlist assignment

## Quick Start

```bash
# Install dependencies
npm install

# Initialize database (first time only)
npm run migrate

# Check pipeline status
npm run status

# Process meetings for a date range
npm run process -- --start=2025-05-01
```

## Directory Structure

```
src/
├── lib/
│   ├── database.js          # SQLite operations and schema
│   ├── escribe-client.js    # Escribe API client
│   ├── youtube-client.js    # YouTube upload client
│   └── utils.js             # Shared utilities
├── workers/
│   ├── calendar-poller.js   # Meeting discovery worker
│   ├── downloader.js        # Video download worker
│   └── uploader.js          # YouTube upload worker
├── queue/
│   └── job-manager.js       # Job queue management
└── cli/
    ├── pipeline.js          # Main orchestrator
    ├── backfill.js          # Date-range backfill
    └── status.js            # Pipeline monitoring

data/
├── meetings.db              # SQLite state database
├── jobs/                    # Job queue files
└── downloads/               # Media files and metadata

scripts/
├── migrate-manifest.js      # Import existing manifest
└── setup.js                 # Database initialization
```

## State Management

### Meeting Status Flow

```
discovered → downloading → downloaded → uploading → uploaded
           ↘              ↘           ↘
            failed         failed      failed
```

### Job Types

- **download**: Extract video and metadata from Escribe
- **upload**: Publish processed video to YouTube

## Configuration

Set these environment variables in `.env`:

```bash
# YouTube API
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback

# YouTube playlists
PLAYLIST_CITY_COMMISSION=your_playlist_id
PLAYLIST_GENERAL_POLICY=your_playlist_id
PLAYLIST_CITY_PLAN_BOARD=your_playlist_id
PLAYLIST_UTILITY_ADVISORY_BOARD=your_playlist_id

# Video download
YTDLP_PATH=/path/to/yt-dlp
```

## Commands

### Pipeline Operations
```bash
npm run process              # Process current month
npm run process -- --start=YYYY-MM-DD
npm run process -- --start=YYYY-MM-DD --end=YYYY-MM-DD
npm run process -- --no-download  # Metadata only
npm run process -- --force        # Reprocess existing
```

### Management
```bash
npm run status               # Show pipeline status
npm run migrate              # Import existing manifest
```

### Legacy (will be replaced)
```bash
npm run metadata-only        # Process without downloads
npm run force-process        # Force reprocess all
```

## Recovery and Debugging

### Pipeline Status
```bash
npm run status
```
Shows:
- Meeting counts by status
- Job queue statistics
- Total pipeline throughput

### Database Queries
```sql
-- Check failed meetings
SELECT * FROM meetings WHERE status = 'failed';

-- Show recent activity
SELECT * FROM meetings ORDER BY updated_at DESC LIMIT 10;

-- Job queue status
SELECT type, status, COUNT(*) FROM jobs GROUP BY type, status;
```

### Job Queue Files
```bash
# Check pending jobs
ls data/jobs/pending/

# Check failed jobs  
ls data/jobs/failed/
cat data/jobs/failed/*-error.json
```

## Data Flow

### Input Sources
- **Escribe Calendar API**: Meeting discovery and metadata
- **Escribe Meeting Pages**: Video URLs and agenda timestamps

### Processing Artifacts
- **Meeting Videos**: MP4 files (cleaned up after upload)
- **Agenda Metadata**: JSON files with timestamp data
- **YouTube Chapters**: Generated descriptions with time markers

### Output Destinations
- **YouTube Videos**: Public videos with chapters
- **YouTube Playlists**: Organized by meeting type
- **Local Database**: Processing state and history

## Error Handling

- **Automatic Retry**: Failed jobs are retried up to 3 times
- **State Recovery**: Pipeline can resume from any failure point
- **Error Logging**: Detailed error information stored with failed jobs
- **Graceful Degradation**: Missing timestamps don't block processing

## Monitoring

The pipeline tracks:
- Meeting discovery and processing rates
- Job queue throughput and backlog
- Error rates and failure modes
- Disk usage and cleanup needs

## Architecture Notes

This system emphasizes:
- **Reliability**: Can recover from any failure point
- **Observability**: Clear visibility into pipeline state
- **Maintainability**: Simple, boring solutions over clever ones
- **Scalability**: Can handle years of historical data

The architecture was designed as a classic ETL pipeline because this is a well-understood pattern for this type of data processing workflow. Each component has a single responsibility and can be tested/debugged independently.

## Legacy System

The original `unified-processor.js` is still functional and serves as a reference implementation. It will be gradually replaced by the new modular architecture as workers are implemented.

## Contributing

This is a municipal transparency tool focused on making government meetings more accessible through automated processing and publishing.