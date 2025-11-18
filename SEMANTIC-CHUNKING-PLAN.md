# Semantic Chunking & Enrichment Pipeline - Implementation Plan

## Overview

This document outlines the plan to evolve the existing meeting archival pipeline into a user-facing product that makes long city meetings navigable through semantic chunking, speaker identification, and transcript enrichment.

## Product Vision

**Problem:** 5-6 hour commission meetings are difficult to navigate. Current Escribe portal only provides agenda timestamps with no context about what was actually discussed.

**Solution:** Linear, YouTube-chapter-like navigation where meetings are broken into semantic chunks (e.g., "Agenda Approval", "Budget Discussion", "Public Comment") with:
- Descriptive titles and summaries
- Full diarized transcripts
- Video timestamps
- Speaker identification

**MVP Scope:** Linear, non-overlapping chunks that users can browse sequentially. Future enhancements may include hierarchical/nested chunks or multi-dimensional navigation (topic-based, speaker-based).

---

## Architecture Principles

### Data Storage Strategy

**Filesystem (`raw/` and `derived/`):**
- **Purpose:** Immutable audit trail, reproducibility, debugging, reprocessing
- **Contents:** Raw outputs from each pipeline step (WhisperX JSON, LLM responses, embeddings)
- **Versioning:** Files include version suffix (e.g., `whisperx_output_v3.1.json`, `chunks_v5.json`)

**Database (SQLite → PostgreSQL later):**
- **Purpose:** Queryable state for webapp API, fast lookups, relational integrity
- **Contents:** Enriched, normalized data (transcript lines, chunks, speakers) + processing metadata
- **Versioning:** Tables include `processing_version` column to track which pipeline version produced the data

**Key Insight:** Both layers are complementary, not redundant. Filesystem enables reprocessing without re-running expensive steps; database enables efficient queries for the webapp.

---

## Database Schema

### Core Tables

```sql
-- Existing: meetings table (already implemented)
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  title TEXT,
  date TEXT,
  state TEXT,
  escribe_url TEXT,
  duration_seconds REAL,
  created_at TEXT,
  updated_at TEXT
);

-- NEW: Track processing pipeline runs
CREATE TABLE processing_jobs (
  id TEXT PRIMARY KEY,
  meeting_id TEXT REFERENCES meetings(id),
  job_type TEXT,  -- 'diarize', 'enrich', 'chunk', 'summarize'
  version TEXT,   -- 'whisperx_v3.1', 'chunker_prompt_v5', etc.
  status TEXT,    -- 'pending', 'running', 'completed', 'failed'
  input_artifact TEXT,  -- path to input file in derived/
  output_artifact TEXT, -- path to output file in derived/
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT
);

-- NEW: Speaker registry
CREATE TABLE speakers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,  -- 'mayor', 'commissioner', 'city_manager', 'staff', 'public'
  title TEXT, -- 'Mayor', 'Commissioner District 1', etc.
  is_active BOOLEAN DEFAULT true,
  created_at TEXT,
  updated_at TEXT
);

-- NEW: Speaker voice samples (for voiceprint training/validation)
CREATE TABLE speaker_samples (
  id TEXT PRIMARY KEY,
  speaker_id TEXT REFERENCES speakers(id),
  meeting_id TEXT,
  start_time REAL,
  end_time REAL,
  audio_path TEXT,  -- path to extracted clip in derived/
  embedding BLOB,   -- serialized numpy array
  embedding_version TEXT,  -- 'pyannote_v3.1', 'resemblyzer_v1', etc.
  quality_score REAL,  -- manual label: 1-5 for clean audio
  created_at TEXT
);

-- NEW: Enriched transcript (one row per utterance)
CREATE TABLE transcript_lines (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  chunk_id TEXT REFERENCES chunks(id),  -- nullable, assigned after chunking
  speaker_id TEXT REFERENCES speakers(id),  -- nullable if unknown
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  text TEXT NOT NULL,

  -- Provenance fields (for debugging/validation)
  whisperx_speaker_label TEXT,  -- 'SPEAKER_00', original label from WhisperX
  voiceprint_confidence REAL,   -- 0.0-1.0, speaker match quality
  was_corrected_by_llm BOOLEAN DEFAULT false,
  correction_reason TEXT,  -- 'introduced_by_name', 'role_context', etc.

  -- Versioning
  processing_version TEXT,  -- 'enrich_v2'
  created_at TEXT
);

CREATE INDEX idx_transcript_meeting ON transcript_lines(meeting_id);
CREATE INDEX idx_transcript_chunk ON transcript_lines(chunk_id);
CREATE INDEX idx_transcript_speaker ON transcript_lines(speaker_id);
CREATE INDEX idx_transcript_time ON transcript_lines(meeting_id, start_time);

-- NEW: Semantic chunks (linear, non-overlapping segments)
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  agenda_item_id TEXT,  -- nullable, future: link to official agenda items
  sequence_number INTEGER,  -- 1, 2, 3... order in meeting
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,

  title TEXT NOT NULL,
  summary TEXT,
  chunk_type TEXT,  -- 'procedural', 'agenda_item', 'presentation', 'public_comment', 'vote', 'discussion'

  -- Optional: Extracted metadata from LLM
  key_participants TEXT,  -- JSON array of speaker_ids
  topics TEXT,  -- JSON array of topic tags

  -- Versioning
  processing_version TEXT,  -- 'chunker_v5'
  created_at TEXT
);

CREATE INDEX idx_chunks_meeting ON chunks(meeting_id, sequence_number);
CREATE INDEX idx_chunks_type ON chunks(chunk_type);
CREATE INDEX idx_chunks_version ON chunks(processing_version);

-- NEW: Meeting-level summaries
CREATE TABLE meeting_summaries (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(id),
  summary TEXT,  -- 2-3 paragraph overview
  key_decisions TEXT,  -- JSON array
  attendance TEXT,  -- JSON array of speaker_ids
  topics TEXT,  -- JSON array
  processing_version TEXT,
  created_at TEXT
);

-- FUTURE: Optional agenda items table (for agenda association feature)
CREATE TABLE agenda_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT REFERENCES meetings(id),
  item_number TEXT,  -- "5.A", "7.B.1", etc.
  title TEXT,
  escribe_timestamp REAL,  -- timestamp from official agenda
  escribe_url TEXT  -- deep link to agenda item
);
```

### Design Decisions

**Why `transcript_lines.chunk_id` instead of time-based joins?**
- Cleaner queries (simple JOIN vs time range comparisons)
- Clear ownership (each line belongs to exactly one chunk)
- Easy re-chunking (just UPDATE chunk_id)
- Handles edge cases deterministically (line at boundary assigned based on start_time)

**Why separate `transcript_lines` instead of embedding in `chunks`?**
- Enables cross-meeting search ("show me everything Mayor Ward said")
- Efficient speaker queries without parsing JSON
- Can re-chunk without re-transcribing
- Database can enforce referential integrity

**Why both filesystem artifacts and database rows?**
- Filesystem: Reprocess without re-running expensive GPU jobs
- Database: Fast queries for webapp API
- Example: Improve chunking prompt → re-run on cached WhisperX output, no GPU needed

---

## Filesystem Organization

```
raw/{meeting_id}/
  video.mp4                    # original download (existing)
  audio.wav                    # extracted for WhisperX (existing)
  escribe_agenda.html          # scraped HTML (existing)
  escribe_transcript.txt       # official transcript (non-diarized)

derived/{meeting_id}/
  whisperx/
    output_v3.1.json           # raw WhisperX output (segments, timestamps)
    word_alignments_v3.1.json  # force-aligned word-level timestamps

  voiceprints/
    embeddings.npz             # extracted speaker embeddings per segment
    matches_v1.json            # voiceprint matching results (SPEAKER_00 → speaker_id)

  enrichment/
    llm_corrections_v2.json    # LLM speaker attribution fixes
    transcript_enriched_v2.json # merged transcript ready for DB insert

  chunking/
    llm_response_v5.json       # raw LLM chunking output
    chunks_v5.json             # parsed + validated chunks

  summarization/
    meeting_summary_v1.json    # meeting-level summary
```

---

## Pipeline Phases (Critical Path)

### Phase A: Foundation (1-2 weeks)
**Goal:** Get high-quality raw materials

#### 1. Implement Database Schema
- [ ] Create schema migration script (`db/migrations/002_semantic_pipeline.sql`)
- [ ] Add versioning to existing `meetings` table if needed
- [ ] Create all new tables (processing_jobs, speakers, speaker_samples, transcript_lines, chunks, meeting_summaries)
- [ ] Test schema with mock data for 1-2 meetings

#### 2. Upgrade Diarization Quality (diarize-worker.js)
- [ ] Integrate WhisperX with force-aligned word-level timestamps
- [ ] Store raw WhisperX output to `derived/{meeting_id}/whisperx/output_v3.1.json`
- [ ] Insert transcript lines into database:
  - `speaker_id` = NULL (will enrich later)
  - `whisperx_speaker_label` = "SPEAKER_00", "SPEAKER_01", etc.
  - `chunk_id` = NULL (will assign after chunking)
- [ ] Update meeting state: UPLOADED → DIARIZED
- [ ] Test on 3-5 historical meetings

#### 3. Build Speaker Registry
- [ ] Manually create entries for known speakers (Mayor, commissioners, frequent staff)
- [ ] Insert into `speakers` table with roles/titles
- [ ] Extract 3-5 voice samples per speaker from past meetings (manual labeling)
- [ ] Store audio clips and metadata in `speaker_samples` table
- [ ] Generate embeddings using pyannote.audio or resemblyzer
- [ ] Store embeddings as BLOB in `speaker_samples`

**Deliverable:** Database with diarized transcripts and speaker registry, ready for enrichment phase.

---

### Phase B: Speaker Enrichment (1-2 weeks)
**Goal:** Map WhisperX's "SPEAKER_00" → "Mayor Harvey Ward"

#### 4. Voiceprint Matching Worker (NEW: enrich-worker.js)
- [ ] Create new state: DIARIZED → ENRICHED
- [ ] Create new BullMQ queue: `enrich`
- [ ] Implement voiceprint matching logic:
  - For each WhisperX speaker segment (SPEAKER_00, SPEAKER_01, etc.):
    - Extract speaker embedding from audio at that timestamp
    - Compare against `speaker_samples` embeddings (cosine similarity)
    - Assign best match if confidence > threshold (e.g., 0.75)
    - Otherwise tag as "Unknown Speaker"
  - Store results to `derived/{meeting_id}/voiceprints/matches_v1.json`
- [ ] Update `transcript_lines` table:
  - Set `speaker_id` based on matches
  - Set `voiceprint_confidence` score
- [ ] Enqueue from workflow orchestrator after diarization completes
- [ ] Test on meetings with known speakers

#### 5. LLM-Based Speaker Correction (enhancement to enrich-worker.js)
- [ ] After voiceprint matching, pass transcript to LLM with prompt:
  ```
  "Review this transcript for speaker attribution errors.
   Use context clues (introductions, role mentions, 'Commissioner X said...')
   to identify misattributions. Return corrections as JSON."
  ```
- [ ] LLM returns: `[{"line_id": "123", "correct_speaker_id": "mayor_ward", "reason": "introduced_by_name"}]`
- [ ] Store corrections to `derived/{meeting_id}/enrichment/llm_corrections_v2.json`
- [ ] Apply corrections to `transcript_lines`:
  - Update `speaker_id`
  - Set `was_corrected_by_llm = true`
  - Set `correction_reason`
- [ ] Log all corrections for review (may retrain voiceprints)

#### 6. Official Transcript Comparison (OPTIONAL)
- [ ] Fetch official Escribe transcript (non-diarized, if available)
- [ ] Use LLM or diff tool to extract proper noun corrections
- [ ] Apply corrections to `transcript_lines.text` for names, technical terms
- [ ] Store comparison results to `derived/{meeting_id}/enrichment/escribe_comparison.json`

**Deliverable:** Enriched transcripts with accurate speaker labels, ready for chunking.

---

### Phase C: Semantic Chunking (2-3 weeks)
**Goal:** Identify meaningful sections for linear navigation

#### 7. Chunking Worker (NEW: chunk-worker.js)
- [ ] Create new state: ENRICHED → CHUNKED
- [ ] Create new BullMQ queue: `chunk`
- [ ] Implement chunking logic:
  - Fetch entire enriched transcript for meeting
  - (Optional) Fetch official agenda items for context
  - Call LLM (Claude Sonnet with 200k context) with prompt:
    ```
    "Analyze this city meeting transcript and divide it into semantic chunks.
     For each chunk provide: start_time, end_time, title, summary, chunk_type.

     Try to align with official agenda items when content matches, but also
     create chunks for procedural sections, public comment, cross-item discussions.

     Return as JSON array ordered by time."
    ```
  - Store raw LLM response to `derived/{meeting_id}/chunking/llm_response_v5.json`
  - Validate and parse chunks
  - Store validated chunks to `derived/{meeting_id}/chunking/chunks_v5.json`
- [ ] Insert chunks into database:
  - Populate `chunks` table with metadata
  - Assign sequence_numbers (1, 2, 3...)
  - Link to agenda items if applicable
- [ ] Update transcript_lines with chunk assignments:
  ```sql
  UPDATE transcript_lines
  SET chunk_id = ?
  WHERE meeting_id = ? AND start_time >= ? AND start_time < ?
  ```
  (Use start_time only to avoid overlap ambiguity)
- [ ] Enqueue from workflow orchestrator after enrichment completes
- [ ] Test chunking quality on 5-10 meetings, iterate on prompt

#### 8. Meeting-Level Summarization (enhancement to chunk-worker.js)
- [ ] After chunking, generate meeting summary using LLM:
  ```
  "Summarize this meeting in 2-3 paragraphs. Extract key decisions,
   votes, attendance, and main topics discussed."
  ```
- [ ] Store to `derived/{meeting_id}/summarization/meeting_summary_v1.json`
- [ ] Insert into `meeting_summaries` table

**Deliverable:** Meetings with semantic chunks and summaries, ready for API serving.

---

### Phase D: API & Frontend (2-4 weeks)
**Goal:** Expose data via REST API for webapp consumption

#### 9. REST API (NEW: /api directory)
- [ ] Choose framework (Express or Fastify)
- [ ] Implement endpoints:
  - `GET /meetings` - list meetings with summaries, filterable by date
  - `GET /meetings/:id` - meeting detail + chunks array
  - `GET /chunks/:id` - chunk detail + transcript lines
  - `GET /speakers` - speaker directory
  - `GET /search?q=...` - full-text search across transcripts
- [ ] Add pagination, filtering, sorting
- [ ] Consider PostgreSQL migration if dataset grows (SQLite fine for MVP)
- [ ] Document API with examples

#### 10. Web App (greenfield)
- [ ] Framework choice (Next.js/React/Vue/etc.) - TBD
- [ ] Core UI components:
  - Meeting list page
  - Meeting detail page with chunk navigation
  - Video player with chapter markers
  - Transcript display with speaker labels
  - Search interface
- [ ] MVP features:
  - Linear chunk navigation (Previous/Next buttons)
  - Jump to video timestamp when clicking chunk
  - Transcript synchronized with video playback
  - Simple search

**Deliverable:** User-facing product that makes meetings navigable.

---

## State Machine Evolution

### Current States (Horizon 1)
```
DISCOVERED → DOWNLOADED → EXTRACTED → UPLOADED → DIARIZED
```

### New States (Horizon 1.5 - Semantic Pipeline)
```
DISCOVERED → DOWNLOADED → EXTRACTED → UPLOADED → DIARIZED → ENRICHED → CHUNKED
```

### Workflow Transitions

Add to `workflow/orchestrator.js`:

```javascript
// After diarization completes
case 'DIARIZED':
  await enqueueMeeting('enrich', meetingId);
  break;

// After enrichment completes
case 'ENRICHED':
  await enqueueMeeting('chunk', meetingId);
  break;

// Chunking is terminal state (for now)
case 'CHUNKED':
  logger.info({ meetingId }, 'Meeting fully processed');
  break;
```

---

## Technical Stack Recommendations

### Don't Change
- ✅ BullMQ/Redis queue system (working great)
- ✅ State machine pattern (proven reliable)
- ✅ Specialized workers architecture (perfect for this pipeline)
- ✅ SQLite for development (migrate to PostgreSQL when scaling)

### New Dependencies

**Speaker Embedding:**
- **pyannote.audio** (recommended) - state-of-the-art speaker diarization/embeddings
- OR **Resemblyzer** - simpler, good enough for MVP
- Store embeddings as BLOB (pickled numpy) or JSON array

**LLM Integration:**
- **Anthropic Claude API** (Sonnet for chunking, Haiku for quick corrections)
- Use official `@anthropic-ai/sdk` package
- Consider LangChain if you need prompt management/versioning

**Storage:**
- Keep current `storage/paths.js` abstraction
- Add versioning helper: `getArtifactPath(category, meetingId, artifact, version)`

---

## What NOT to Build Yet

These are explicitly **out of scope** for MVP:

- ❌ Multi-city support - wait until Gainesville workflow is polished
- ❌ Custom video streaming - YouTube embed is sufficient
- ❌ Real-time processing - batch processing is fine
- ❌ Advanced search (vector/semantic search) - basic text search is enough initially
- ❌ User accounts/authentication - public read-only is fine
- ❌ Hierarchical/nested chunks - linear is simpler, learn from users first
- ❌ Many-to-many chunk relationships - one chunk per line for MVP

These can be added later based on user feedback.

---

## Migration from Current System

The existing pipeline (P0-P8 from original PRD) is complete and working. This plan builds **on top** of it:

1. ✅ Discovery, download, extract, upload, diarize workers **already exist**
2. ✅ State machine, BullMQ queues, SQLite database **already working**
3. ✅ Systemd services, logging, observability **already deployed**

**New work** = add three new workers (enrich, chunk, summarize) + database schema + API layer.

---

## Success Metrics

**Pipeline Quality:**
- Speaker identification accuracy > 85% (measured by manual review of sample)
- Chunk boundary accuracy within ±30 seconds of semantic transitions
- LLM chunking produces 5-15 chunks per hour of meeting content

**User Value:**
- Mean time to find relevant content reduced from 30+ minutes (watching full video) to < 5 minutes (browsing chunks)
- Chunk summaries accurately reflect content (manual review)

**System Reliability:**
- < 5% processing failures (same standard as existing pipeline)
- Enrichment + chunking completes within 1 hour per meeting (2x meeting duration)

---

## Open Questions & Decisions Needed

1. **Speaker embedding model:** pyannote.audio vs Resemblyzer vs other?
2. **LLM chunking prompt tuning:** How much context to provide? Include agenda or not?
3. **Chunk granularity:** Target 5-15 chunks per hour, or more fine-grained?
4. **Official transcript usage:** Worth the complexity to fetch/compare Escribe transcripts?
5. **Storage migration:** When to move from SQLite to PostgreSQL? (probably after 100+ meetings)
6. **Agenda association:** Build this in Phase C, or defer to later iteration?

---

## Next Immediate Actions

**This Week:**
1. Review this plan, clarify any questions
2. Implement database schema (Phase A, step 1)
3. Mock out 1-2 test meetings to validate schema design

**Next 2-3 Weeks:**
4. Complete diarize-worker.js with WhisperX integration (Phase A, step 2)
5. Build speaker registry with 10-15 known speakers (Phase A, step 3)
6. Test on 5 historical meetings

**Month 2:**
7. Build enrich-worker.js with voiceprint matching (Phase B, steps 4-5)
8. Test enrichment quality, iterate on matching threshold

**Month 3:**
9. Build chunk-worker.js with LLM semantic analysis (Phase C, step 7)
10. Test chunking quality, iterate on prompt
11. Start API design

---

## Questions or Feedback?

This is a living document. Update as you learn more about what works and what doesn't. Version control this plan alongside the code.
