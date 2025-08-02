# GNV City Meetings Pipeline

## Migration from Legacy System

If you have an existing `downloads/processed-meetings.json` file:
```bash
node scripts/migrate-from-manifest.js
```

This will import your processing history into the new SQLite database.

## Quick Start

1. Start Redis:
```bash
npm run redis:start
```

2. Start the specialized workers:

**Option A: Via systemd (recommended for production):**
```bash
sudo systemctl start gnv-meetings-download
sudo systemctl start gnv-meetings-extract  
sudo systemctl start gnv-meetings-upload
sudo systemctl start gnv-meetings-diarize
```

**Option B: Manually (for development):**
```bash
npm run worker:download  # Downloads videos
npm run worker:extract   # Extracts agendas  
npm run worker:upload    # Uploads to YouTube
npm run worker:diarize   # Transcribes audio (GPU required)
```

3. Discover and enqueue meetings:
```bash
# Discover current month's meetings and enqueue them
./discover.js --enqueue-only

# Or discover specific date range
./discover.js --from=2024-01-01 --to=2024-01-31 --enqueue-only
```

## Architecture

The pipeline uses a **state machine workflow** with specialized workers:
- SQLite database (`meetings.db`) for state tracking
- BullMQ/Redis for job queuing between steps
- Dedicated workers for each processing step

### Meeting States & Workers

1. `DISCOVERED` → **download-worker.js** → `DOWNLOADED`
2. `DOWNLOADED` → **extract-worker.js** → `EXTRACTED` 
3. `EXTRACTED` → **upload-worker.js** → `UPLOADED`
4. `UPLOADED` → **diarize-worker.js** → `DIARIZED`
5. `FAILED` - Processing failed at any step

### Components

- `discover.js` - Finds meetings and enqueues download jobs
- `workers/download-worker.js` - Downloads video files
- `workers/extract-worker.js` - Extracts agenda and generates chapters
- `workers/upload-worker.js` - Uploads to YouTube with playlists
- `diarize-worker.js` - Transcribes audio (WhisperX on GPU)
- `workflow/orchestrator.js` - Handles state transitions between steps

### Monitoring

Check Redis queue status:
```bash
npm run redis:logs
```

Query database:
```bash
sqlite3 meetings.db "SELECT id, title, state FROM meetings ORDER BY date DESC LIMIT 10;"
```

### New Features from Main Branch

- **YouTube Playlists**: Videos automatically added to playlists based on meeting type
- **Public Videos**: Changed from unlisted to public for better discoverability  
- **Token Refresh**: YouTube OAuth tokens automatically refresh
- **File Cleanup**: Optional cleanup job to manage disk space while preserving pipeline integrity

### Cleanup Management

The cleanup job only removes large raw video files after a configurable period, keeping smaller derived files (chapters, metadata) for reference:

```bash
# Dry run to see what would be cleaned
npm run cleanup -- --dry-run

# Clean files older than 30 days (default)
npm run cleanup

# Clean files older than 60 days
CLEANUP_AFTER_DAYS=60 npm run cleanup
```