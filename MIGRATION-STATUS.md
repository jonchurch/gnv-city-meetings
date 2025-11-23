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
- [x] `diarize-worker.js` - updates `processing_status` to PostgreSQL

### Key Design Decisions
- **Dual-write pattern**: SQLite handles orchestration, PostgreSQL stores application data
- **Write order**: PostgreSQL writes happen BEFORE workflow advancement
- **Testing mode**: YouTube uploads disabled, returns mock URLs
- **Deferred features**: Transcript line parsing, blob storage paths

## 🚧 In Progress / TODO

### High Priority
- [ ] Parse WhisperX JSON output in diarize-worker
- [ ] Insert transcript_lines into PostgreSQL
- [ ] Test end-to-end with a real meeting

### Medium Priority
- [ ] Decide blob storage strategy for agenda_data and chapters_text
- [ ] Populate `escribe_agenda_path` and `escribe_transcript_path` fields
- [ ] Handle transcript line to chunk assignments

### Future Work
- [ ] Implement chunking pipeline (parse agenda → create chunks)
- [ ] Speaker identification and voiceprinting
- [ ] Meeting summary generation
- [ ] Migrate orchestration to pg-task
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
- No transcript_lines yet (parsing not implemented)

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

1. **Test with real meeting** - Run discovery and full pipeline
2. **Implement transcript parsing** - Parse WhisperX JSON in diarize-worker
3. **Validate data** - Check PostgreSQL has all expected data
4. **Iterate** - Fix issues, add missing features

## Migration to pg-task (Future)

Once PostgreSQL is proven stable:
1. Implement pg-task job system
2. Replace BullMQ queues with pg-task
3. Remove SQLite database
4. Simplify workers (single write to PostgreSQL)
5. Use pg-task for workflow orchestration
