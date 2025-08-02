# GNV City Meetings Pipeline - New Architecture

## Quick Start

1. Start Redis:
```bash
npm run redis:start
```

2. In one terminal, run the worker:
```bash
npm run worker
```

3. In another terminal, discover and enqueue meetings:
```bash
# Discover current month's meetings and enqueue them
./discover.js --enqueue-only

# Or discover specific date range
./discover.js --from=2024-01-01 --to=2024-01-31 --enqueue-only
```

## Architecture

The pipeline now uses:
- SQLite database (`meetings.db`) for state tracking
- BullMQ/Redis for job queuing
- Separate discover and process scripts

### Meeting States

1. `DISCOVERED` - Meeting found and inserted into DB
2. `PROCESSING` - Worker has picked up the job
3. `DOWNLOADING` - Video is being downloaded
4. `UPLOADING` - Video is being uploaded to YouTube
5. `UPLOADED` - Successfully uploaded
6. `DIARIZING` - Being processed for transcription (future)
7. `DIARIZED` - Transcription complete (future)
8. `FAILED` - Processing failed

### Scripts

- `discover.js` - Finds meetings and adds to DB/queue
- `process.js` - Processes a single meeting (download, extract, upload)
- `worker.js` - BullMQ worker that runs process.js for queued jobs

### Monitoring

Check Redis queue status:
```bash
npm run redis:logs
```

Query database:
```bash
sqlite3 meetings.db "SELECT id, title, state FROM meetings ORDER BY date DESC LIMIT 10;"
```