# PostgreSQL Migration Plan

## Current State (After Rollback)

We have:
- ✅ PostgreSQL schema (`db/schema.sql`) - designed for final application
- ✅ Query layer (`db/queries.js`) - CRUD operations for PostgreSQL
- ✅ Test data scripts - validate schema works
- ✅ Existing SQLite-based pipeline - fully functional with BullMQ orchestration

## Goal

**Dual-write approach**: Keep the existing SQLite orchestration pipeline running while adding PostgreSQL writes alongside it.

### Why Dual-Write?

1. **Don't break the working pipeline** - SQLite + BullMQ orchestration continues to manage workflow
2. **Start populating PostgreSQL** - Accumulate real data to validate schema design
3. **Test incrementally** - Prove PostgreSQL schema works with production data
4. **Later migration path** - Once PG is proven, we can switch to pg-task orchestration and remove SQLite

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Worker (e.g., download-worker.js)                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Do work (download video)                            │
│                                                          │
│  2. OLD: advanceWorkflow() → SQLite + BullMQ            │
│     (keeps pipeline running)                            │
│                                                          │
│  3. NEW: db.upsertMeeting() → PostgreSQL                │
│     (populates application data)                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Worker-by-Worker Plan

### 1. discover.js
**Current:** Creates meetings in SQLite
**Add:** Also create in PostgreSQL

```javascript
// OLD (keep)
const db = await initializeDatabase();
await insertMeeting(db, meeting);
await queue.add(...);

// NEW (add)
await pgDb.upsertMeeting({
  id: meeting.id,
  title: meeting.title,
  date: meeting.date,
  meeting_type: parseMeetingType(meeting.title),
  escribe_url: meeting.meeting_url,
  processing_status: 'discovered'
});
```

### 2. download-worker.js
**Current:** Downloads video, updates SQLite via advanceWorkflow()
**Add:** Also update PostgreSQL

```javascript
const result = await downloadVideo(meetingId);

// OLD (keep) - manages workflow state
await advanceWorkflow(meetingId, 'DISCOVERED', {
  video_path: result.outputPath
});

// NEW (add) - stores data in PostgreSQL
await pgDb.upsertMeeting({
  id: meetingId,
  video_path: result.outputPath,
  processing_status: 'downloaded'
});
```

### 3. extract-worker.js
**Current:** Extracts agenda/chapters, extracts audio
**Add:** Store paths in PostgreSQL

```javascript
const result = await extractMeetingData(meetingId);
await extractAudio(videoPath, audioPath);

// OLD (keep)
await advanceWorkflow(meetingId, 'DOWNLOADED', {
  agenda_data: result.agendaData,
  chapters_text: result.chaptersText
});

// NEW (add)
await pgDb.upsertMeeting({
  id: meetingId,
  audio_path: audioPath,
  // TODO: escribe_agenda_path, escribe_transcript_path
  // Currently worker stores agenda_data as JSON blob in advanceWorkflow
  // and writes chapters_text to local fs, but doesn't upload to blob storage
  // Need to decide: S3? Local file server? Keep as-is for now.
  processing_status: 'extracted'
});
```

### 4. upload-worker.js
**Current:** Uploads to YouTube
**Add:** Store YouTube URL in PostgreSQL

```javascript
const ytResult = await uploadMeetingToYouTube(meetingId);

// OLD (keep)
await advanceWorkflow(meetingId, 'EXTRACTED', {
  youtube_url: ytResult.url,
  youtube_video_id: ytResult.videoId,
  playlist_results: ytResult.playlistResults
});

// NEW (add)
await pgDb.upsertMeeting({
  id: meetingId,
  youtube_url: ytResult.url,
  // Note: youtube_video_id and playlist_results not in schema
  // Can add later if needed
  processing_status: 'uploaded'
});
```

### 5. diarize-worker.js
**Current:** Runs WhisperX, stores diarized JSON file
**Add:** Parse and insert transcript_lines into PostgreSQL

```javascript
await runWhisperX(localAudioPath, localOutputPath);
await writeFile(localOutputPath, StorageTypes.DERIVED_DIARIZED, meetingId);

// OLD (keep)
await advanceWorkflow(meetingId, 'UPLOADED');

// NEW (add)
const diarizedData = JSON.parse(await fs.readFile(localOutputPath, 'utf8'));
const transcriptLines = parseDiarizedOutput(diarizedData, meetingId);
await pgDb.insertTranscriptLines(meetingId, transcriptLines, 'whisperx_v1');
await pgDb.upsertMeeting({
  id: meetingId,
  processing_status: 'diarized'
});
```

## Data Mapping Notes

### Fields that map cleanly:
- `video_path` ✅
- `audio_path` ✅
- `youtube_url` ✅
- `escribe_url` ✅

### Intermediate data (need blob storage strategy):
- `agenda_data` - raw JSON from eScribe → should write to blob, store path in `escribe_agenda_path`
- `chapters_text` - timestamp text → written to local fs, needs blob storage path
- Workers use `pathFor()` and storage helpers but don't currently upload these to persistent blob storage

### Fields to skip for now:
- `youtube_video_id` - can extract from URL if needed
- `playlist_results` - not needed in final schema

### Future work:
- Chunking pipeline will parse agenda_data and create `chunks` records
- Speaker identification will populate `speakers` table
- Meeting summaries will be generated and stored in `meeting_summaries`

## Implementation Steps

1. ✅ Add `parseMeetingType()` helper function
2. Update `discover.js` to dual-write
3. Update `download-worker.js` to dual-write
4. Update `extract-worker.js` to dual-write
5. Update `upload-worker.js` to dual-write
6. Update `diarize-worker.js` to dual-write + parse transcript
7. Test end-to-end with a real meeting

## Success Criteria

After running a meeting through the pipeline:
- SQLite database has meeting with state = 'DIARIZED' ✅
- PostgreSQL has:
  - Meeting record with all paths populated ✅
  - processing_status = 'diarized' ✅
  - transcript_lines populated with WhisperX output ✅
  - All timestamps and speaker labels preserved ✅

## Future Migration Path

Once PostgreSQL is validated:
1. Implement pg-task orchestration
2. Remove SQLite database entirely
3. Remove BullMQ (pg-task handles queuing)
4. Simplify workers to only write to PostgreSQL
