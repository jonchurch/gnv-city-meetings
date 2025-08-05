# Queue Manager CLI

A comprehensive command-line tool for managing meetings and their associated jobs in the distributed processing pipeline.

## Overview

The Queue Manager CLI provides two levels of management:

1. **Meeting-level operations** - Manage the overall workflow state of meetings
2. **Queue-level operations** - Manage individual jobs in specific queues

This tool understands the relationship between meetings and their jobs, ensuring consistent state management across the distributed system.

## Installation

The CLI is located at `scripts/queue-manager.js` and can be run directly with Node.js:

```bash
node scripts/queue-manager.js <command> [options]
```

## Meeting Commands

### `meeting <meetingId>`
Shows comprehensive status of a meeting and all related jobs across queues.

```bash
node scripts/queue-manager.js meeting b27b5bd3-369f-4a0a-a942-255b10698bd2
```

**Output includes:**
- Meeting metadata (title, date, state, video path, YouTube URL)
- Current error message (if any)
- Status of related jobs in all queues (download, extract, upload, diarize)

### `restart <meetingId> <state>`
Restarts a meeting workflow from a specific state. This will:
- Reset the meeting state in the database
- Remove any existing job for the next step
- Create a fresh job with proper ID

```bash
node scripts/queue-manager.js restart b27b5bd3-369f-4a0a-a942-255b10698bd2 UPLOADED
```

**Valid states:**
- `DISCOVERED` - Restart from beginning (will queue download)
- `DOWNLOADED` - Restart from extraction phase
- `EXTRACTED` - Restart from upload phase  
- `UPLOADED` - Restart from diarization phase

### `set-state <meetingId> <state>`
Directly sets a meeting's state without affecting jobs. Use with caution.

```bash
node scripts/queue-manager.js set-state b27b5bd3-369f-4a0a-a942-255b10698bd2 UPLOADED
```

## Queue Commands

### `list <queue> [state] [limit]`
Lists jobs in a specific queue, optionally filtered by state.

```bash
# List all jobs in diarize queue
node scripts/queue-manager.js list diarize

# List only failed jobs
node scripts/queue-manager.js list diarize failed

# List first 5 waiting jobs
node scripts/queue-manager.js list download waiting 5
```

**States:** `all`, `waiting`, `active`, `completed`, `failed`, `delayed`

### `stats <queue>`
Shows queue statistics and counts.

```bash
node scripts/queue-manager.js stats diarize
```

### `add <queue> <meetingId>`
Adds a job to a queue with the proper predictable ID format (`<queue>-<meetingId>`).

```bash
node scripts/queue-manager.js add diarize b27b5bd3-369f-4a0a-a942-255b10698bd2
```

**Note:** Will not add if a job with that ID already exists.

### `retry <queue> <jobId>`
Retries a failed job by moving it back to waiting state.

```bash
node scripts/queue-manager.js retry diarize diarize-b27b5bd3-369f-4a0a-a942-255b10698bd2
```

### `remove <queue> <jobId>`
Removes a specific job from a queue.

```bash
node scripts/queue-manager.js remove diarize diarize-b27b5bd3-369f-4a0a-a942-255b10698bd2
```

### `clear <queue> <state>`
Removes ALL jobs of a given state, regardless of age.

```bash
# Clear all failed jobs
node scripts/queue-manager.js clear diarize failed

# Clear all completed jobs
node scripts/queue-manager.js clear download completed
```

### `clean <queue> <state>`
Removes jobs of a given state that are older than 1 day (uses BullMQ's built-in clean function).

```bash
node scripts/queue-manager.js clean diarize completed
```

## Available Queues

- `download` - Video download jobs
- `extract` - Agenda and chapter extraction jobs
- `upload` - YouTube upload jobs
- `diarize` - Audio transcription and diarization jobs

## Workflow States

- `DISCOVERED` - Meeting found and stored in database
- `DOWNLOADED` - Video file downloaded to storage
- `EXTRACTED` - Agenda and chapters extracted
- `UPLOADED` - Video uploaded to YouTube
- `DIARIZED` - Audio transcribed and diarized (terminal state)
- `FAILED` - Processing failed (terminal state)

## Common Workflows

### Restarting a Failed Meeting
1. Check meeting status: `node scripts/queue-manager.js meeting <meetingId>`
2. Restart from appropriate state: `node scripts/queue-manager.js restart <meetingId> <state>`

### Cleaning Up Queues
```bash
# Clear all failed jobs from all queues
node scripts/queue-manager.js clear download failed
node scripts/queue-manager.js clear extract failed  
node scripts/queue-manager.js clear upload failed
node scripts/queue-manager.js clear diarize failed
```

### Monitoring Queue Health
```bash
# Check statistics for all queues
node scripts/queue-manager.js stats download
node scripts/queue-manager.js stats extract
node scripts/queue-manager.js stats upload
node scripts/queue-manager.js stats diarize
```

## Job ID Format

The CLI uses predictable job IDs in the format `<queue>-<meetingId>`:
- `download-b27b5bd3-369f-4a0a-a942-255b10698bd2`
- `extract-b27b5bd3-369f-4a0a-a942-255b10698bd2`
- `upload-b27b5bd3-369f-4a0a-a942-255b10698bd2`
- `diarize-b27b5bd3-369f-4a0a-a942-255b10698bd2`

This ensures:
- **Deduplication**: Only one job per meeting per queue
- **Predictable lookup**: Easy to find jobs for a specific meeting
- **Idempotency**: Safe to retry job creation

## Error Handling

The CLI provides clear error messages and will:
- Validate queue names and meeting IDs
- Check if meetings exist before operations
- Show detailed error information for failed jobs
- Prevent unsafe operations (e.g., adding duplicate jobs)

## Dependencies

- Requires the Meetings API to be running for meeting-level operations
- Connects to Redis for queue operations
- Uses the same configuration as the main application