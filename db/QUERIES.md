# Database Query Layer

Clean API for interacting with PostgreSQL without writing raw SQL throughout the codebase.

## Files

- **`client.js`** - Connection pool management
- **`queries.js`** - Query helper functions
- **`test-queries.js`** - Test script to verify all queries work

## Usage

### Import the queries

```javascript
import * as db from './db/queries.js';
// or
import { listMeetings, getMeeting, upsertMeeting } from './db/queries.js';
```

### Common Operations

#### Meetings

```javascript
// List all meetings (with optional filtering)
const meetings = await db.listMeetings({
  meeting_type: 'City Commission',
  status: 'chunked',
  limit: 20,
  offset: 0
});

// Get a single meeting
const meeting = await db.getMeeting('mtg_123');

// Get meeting with all chunks and summary
const fullMeeting = await db.getMeetingWithChunks('mtg_123');

// Create or update a meeting
const meeting = await db.upsertMeeting({
  id: 'mtg_123',
  title: 'City Commission Meeting - January 2025',
  meeting_type: 'City Commission',
  date: '2025-01-15',
  escribe_url: 'https://...',
  processing_status: 'discovered'
});

// Update processing status
await db.updateMeetingStatus('mtg_123', 'downloaded', {
  processing_version: 'pipeline_v1'
});
```

#### Speakers

```javascript
// List all speakers
const speakers = await db.listSpeakers({ activeOnly: true });

// Get a speaker
const speaker = await db.getSpeaker('harvey_ward');

// Create/update speaker
await db.upsertSpeaker({
  id: 'harvey_ward',
  name: 'Harvey Ward',
  role: 'mayor',
  title: 'Mayor'
});
```

#### Chunks

```javascript
// Get all chunks for a meeting
const chunks = await db.getChunks('mtg_123');

// Get chunk with full transcript
const chunk = await db.getChunkWithTranscript('chunk_456');

// Bulk insert chunks
await db.insertChunks('mtg_123', [
  {
    id: 'chunk_1',
    sequence_number: 1,
    start_time: 0,
    end_time: 120,
    title: 'Call to Order',
    summary: 'Mayor opens the meeting',
    chunk_type: 'procedural'
  },
  // ... more chunks
], 'pipeline_v1');
```

#### Transcript Lines

```javascript
// Get all transcript lines for a meeting
const lines = await db.getTranscriptLines('mtg_123');

// Bulk insert transcript lines
await db.insertTranscriptLines('mtg_123', [
  {
    id: 'line_1',
    start_time: 8.0,
    end_time: 13.0,
    text: 'Good evening everyone...',
    speaker_id: 'harvey_ward',
    whisperx_speaker_label: 'SPEAKER_00'
  },
  // ... more lines
], 'pipeline_v1');

// Assign chunks to transcript lines after chunking
await db.assignChunksToTranscriptLines('mtg_123', [
  { chunkId: 'chunk_1', startTime: 0, endTime: 120 },
  { chunkId: 'chunk_2', startTime: 120, endTime: 240 },
]);
```

#### Meeting Summaries

```javascript
// Get meeting summary
const summary = await db.getMeetingSummary('mtg_123');

// Create/update summary
await db.upsertMeetingSummary('mtg_123', {
  summary: 'The commission discussed...',
  key_decisions: [
    { decision: 'Approved budget', vote: '5-0' }
  ],
  key_topics: ['budget', 'zoning'],
  attendees: ['harvey_ward', 'david_arreola'],
  processing_version: 'pipeline_v1'
});
```

#### Search

```javascript
// Full-text search across transcripts
const results = await db.searchTranscripts('affordable housing', {
  limit: 50
});
```

## Testing

Run the test suite to verify all queries work:

```bash
node db/test-queries.js
```

This will:
- Test all query functions
- Insert mock data
- Verify relationships work correctly
- Clean up test data

## Connection Management

The query layer uses a connection pool for efficiency. The pool is automatically created when you import the queries.

### Environment Variables

Make sure `DATABASE_URL` is set in your `.env`:

```
DATABASE_URL=postgresql://gnv_meetings_user:gnv_meetings_dev_password@localhost:5432/gnv_meetings
```

### Closing Connections

When shutting down your application, close the pool:

```javascript
import { close } from './db/client.js';

// On shutdown
await close();
```

## Query Performance

The query layer includes:

- **Connection pooling** - Reuses connections for efficiency
- **Slow query logging** - Logs queries > 100ms
- **Prepared statements** - All queries use parameterized queries (prevents SQL injection)
- **Transactions** - Bulk inserts use transactions for atomicity

## Error Handling

All query errors are logged and re-thrown. Wrap calls in try/catch:

```javascript
try {
  const meeting = await db.getMeeting('nonexistent_id');
} catch (error) {
  console.error('Query failed:', error.message);
}
```

## Design Patterns

### Upsert Pattern

Many functions use `ON CONFLICT ... DO UPDATE` for idempotent operations:

```javascript
// Safe to call multiple times with same ID
await db.upsertMeeting({ id: 'mtg_123', title: 'New Title' });
await db.upsertMeeting({ id: 'mtg_123', title: 'Updated Title' }); // Updates existing
```

### Bulk Insert Pattern

For performance, use bulk inserts with transactions:

```javascript
// Atomic - all or nothing
await db.insertTranscriptLines('mtg_123', [/* 1000s of lines */], 'v1');
```

### Soft Deletes

Speaker references use `ON DELETE SET NULL` to preserve data:

```javascript
// Deleting a speaker doesn't delete transcript lines
// They just have speaker_id = NULL
```

## Future Enhancements

Potential additions as needs arise:

- Pagination helpers (cursor-based)
- Query result caching
- Read replicas support
- Batch operation helpers
- Query builder for complex filters
