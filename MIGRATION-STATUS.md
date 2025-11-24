# PostgreSQL Migration Status

## ✅ Completed

### Infrastructure
- [x] PostgreSQL 16 running in Docker
- [x] Complete schema design (`db/schema.sql`)
  - meetings, chunks, transcript_lines, speakers, speaker_samples, meeting_summaries
- [x] Query layer (`db/queries.js`) with 22+ helper functions
- [x] Test data generation scripts
- [x] Schema validation with realistic data

### Dual-Write Implementation
- [x] `discover.js` - writes meetings to both SQLite and PostgreSQL
- [x] `download-worker.js` - writes `video_path` to PostgreSQL
- [x] `extract-worker.js` - writes `audio_path` to PostgreSQL
- [x] `upload-worker.js` - writes `youtube_url` to PostgreSQL (uploads disabled for testing)
- [x] `diarize-worker.js` - **parses WhisperX output and inserts transcript_lines into PostgreSQL**

### Transcript Processing
- [x] **Parse WhisperX JSON segments** into transcript_lines format
- [x] **Store transcript lines** with:
  - Speaker labels (`whisperx_speaker_label`: SPEAKER_00, SPEAKER_01, etc.)
  - Timestamps (`start_time`, `end_time` in seconds)
  - Full transcript text
  - Deterministic IDs (`{meetingId}_seg_{index}`)
- [x] **Query helpers** (`getTranscriptLines`, `insertTranscriptLines`)
- [x] **Test script** (`test-transcript-parsing.js`) validates parsing

### Key Design Decisions
- **Dual-write pattern**: SQLite handles orchestration, PostgreSQL stores application data
- **Write order**: PostgreSQL writes happen BEFORE workflow advancement
- **Testing mode**: YouTube uploads disabled, returns mock URLs
- **Transcript storage**: Segment-level only (not word-level)
- **Speaker pipeline**: Store raw WhisperX labels now, map to real names later via voiceprinting
- **Enrichment fields**: `chunk_id`, `speaker_id`, `voiceprint_confidence` initially NULL

## 🚧 In Progress / TODO

### High Priority
- [x] ~~Parse WhisperX JSON output in diarize-worker~~ ✅ Done!
- [x] ~~Insert transcript_lines into PostgreSQL~~ ✅ Done!
- [ ] Implement chunking pipeline (parse agenda → create chunks → assign transcript lines)

### Medium Priority
- [ ] Speaker identification and voiceprinting (map SPEAKER_XX to real names)
- [ ] Decide blob storage strategy for agenda_data and chapters_text
- [ ] Populate `escribe_agenda_path` and `escribe_transcript_path` fields

### Future Work
- [ ] Meeting summary generation (per-chunk or per-meeting)
- [ ] LLM-based transcript correction (`was_corrected_by_llm` field)
- [ ] Migrate orchestration to pg-task (replace BullMQ/Redis)
- [ ] Remove SQLite dependency

## Testing Readiness

**Current State:**
- ✅ PostgreSQL schema deployed
- ✅ Workers write to PostgreSQL
- ✅ YouTube uploads disabled (safe for testing)
- ✅ SQLite orchestration intact (pipeline still works)

**Ready to test:**
```bash
# 1. Ensure services are running
docker-compose up -d

# 2. Run discovery (will write to both DBs)
./discover.js

# 3. Start workers
node workers/download-worker.js &
node workers/extract-worker.js &
node workers/upload-worker.js &
node workers/diarize-worker.js &

# 4. Check PostgreSQL after pipeline completes
docker exec gnv-meetings-postgres psql -U gnv_meetings_user -d gnv_meetings \
  -c "SELECT id, title, processing_status, video_path, youtube_url FROM meetings;"
```

**Expected Results:**
- Meeting record with `processing_status = 'diarized'`
- Paths populated: `video_path`, `audio_path`, `youtube_url` (mock)
- **Transcript lines fully populated** with speaker labels and timestamps

**Verify transcript data:**
```bash
docker exec gnv-meetings-postgres psql -U gnv_meetings_user -d gnv_meetings \
  -c "SELECT COUNT(*), COUNT(DISTINCT whisperx_speaker_label) as speakers FROM transcript_lines WHERE meeting_id = 'YOUR_MEETING_ID';"
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ BullMQ/Redis (Orchestration - Unchanged)                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Workers (Dual-Write)                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Do work (download, extract, upload, diarize)        │
│                                                          │
│  2. Write to PostgreSQL (application data)              │
│     └─> db.upsertMeeting(...)                           │
│                                                          │
│  3. Write to SQLite (workflow state)                    │
│     └─> advanceWorkflow(...)                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
           │                            │
           ▼                            ▼
┌──────────────────┐      ┌──────────────────────────────┐
│ PostgreSQL       │      │ SQLite + BullMQ              │
│ (Application)    │      │ (Orchestration)              │
├──────────────────┤      ├──────────────────────────────┤
│ meetings         │      │ meetings (state tracking)    │
│ chunks           │      │ BullMQ jobs/queues           │
│ transcript_lines │      └──────────────────────────────┘
│ speakers         │
│ meeting_summaries│
└──────────────────┘
```

## Next Steps

**The Big One: Chunking Pipeline**
This is the core product feature - breaking meetings into navigable semantic segments.

1. **Parse agenda data** - Extract agenda items with timestamps from extract-worker output
2. **Create chunks** - Insert records into `chunks` table with title, start/end times
3. **Assign transcript lines** - Match transcript_lines to chunks based on timestamps, populate `chunk_id`
4. **Test navigation** - Verify users can jump to specific agenda items

**Other priorities:**
- Speaker identification (voiceprinting)
- Meeting summaries
- Test full pipeline end-to-end with multiple meetings

## Migration to pg-task (Future)

Once PostgreSQL is proven stable:
1. Implement pg-task job system
2. Replace BullMQ queues with pg-task
3. Remove SQLite database
4. Simplify workers (single write to PostgreSQL)
5. Use pg-task for workflow orchestration
