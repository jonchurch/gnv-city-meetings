-- ============================================================================
-- GNV City Meetings - Application Data Model
-- PostgreSQL Schema
-- ============================================================================
-- Purpose: Stores queryable data for the webapp (meetings, speakers, chunks,
--          transcripts). Does NOT include orchestration/task queue tables.
-- ============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- MEETINGS
-- Core entity representing a city meeting
-- ============================================================================
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,

  -- Basic metadata
  title TEXT NOT NULL,
  meeting_type TEXT,  -- 'City Commission', 'Planning Board', 'General Policy Committee', etc.
  date DATE NOT NULL,
  duration_seconds INTEGER,

  -- Source links
  escribe_url TEXT,
  youtube_url TEXT,

  -- Blob storage paths (raw materials)
  video_path TEXT,              -- e.g., 's3://bucket/raw/{id}/video.mp4'
  audio_path TEXT,
  escribe_agenda_path TEXT,
  escribe_transcript_path TEXT,

  -- Processing state
  processing_status TEXT NOT NULL DEFAULT 'discovered',
    -- Values: 'discovered', 'downloaded', 'transcribed', 'enriched', 'chunked', 'failed'
  processing_version TEXT,      -- Which pipeline version processed this
  processed_at TIMESTAMPTZ,
  error_message TEXT,           -- If processing_status = 'failed'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_meetings_date ON meetings(date DESC);
CREATE INDEX idx_meetings_type ON meetings(meeting_type) WHERE meeting_type IS NOT NULL;
CREATE INDEX idx_meetings_status ON meetings(processing_status);

-- Comments for documentation
COMMENT ON TABLE meetings IS 'City government meetings (Commission, Planning Board, etc.)';
COMMENT ON COLUMN meetings.processing_status IS 'Pipeline state: discovered → downloaded → transcribed → enriched → chunked';
COMMENT ON COLUMN meetings.processing_version IS 'Tracks which version of pipeline processed this meeting (for reproducibility)';


-- ============================================================================
-- SPEAKERS
-- Global registry of people who speak at meetings
-- ============================================================================
CREATE TABLE speakers (
  id TEXT PRIMARY KEY,          -- e.g., 'harvey_ward', 'david_arreola'

  -- Identity
  name TEXT NOT NULL,
  role TEXT,                    -- 'mayor', 'commissioner', 'city_manager', 'staff', 'public'
  title TEXT,                   -- 'Mayor', 'Commissioner At-Large', 'Commissioner District 1', etc.

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_speakers_role ON speakers(role);
CREATE INDEX idx_speakers_active ON speakers(is_active) WHERE is_active = true;

COMMENT ON TABLE speakers IS 'Global registry of speakers across all meetings';
COMMENT ON COLUMN speakers.role IS 'General role category for filtering/display';


-- ============================================================================
-- SPEAKER_SAMPLES
-- Voice samples for voiceprint matching
-- ============================================================================
CREATE TABLE speaker_samples (
  id TEXT PRIMARY KEY,
  speaker_id TEXT NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,

  -- Source information
  meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE,
  start_time REAL NOT NULL,     -- Seconds into meeting video
  end_time REAL NOT NULL,

  -- Blob storage paths
  audio_clip_path TEXT NOT NULL,    -- e.g., 's3://bucket/derived/{meeting}/samples/{speaker}.wav'
  embedding_path TEXT,              -- e.g., 's3://bucket/derived/{meeting}/embeddings/{speaker}.npy'
  embedding_version TEXT,           -- 'pyannote_v3.1', 'resemblyzer_v1', etc.

  -- Quality metadata
  quality_score REAL,               -- 1-5, manually labeled (5 = clean audio, 1 = noisy)
  notes TEXT,                       -- Any manual notes about this sample

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_speaker_samples_speaker ON speaker_samples(speaker_id);
CREATE INDEX idx_speaker_samples_meeting ON speaker_samples(meeting_id);

COMMENT ON TABLE speaker_samples IS 'Training data for voiceprint matching - known speaker voice samples';
COMMENT ON COLUMN speaker_samples.quality_score IS 'Manual quality rating: 5 = excellent, 1 = poor/noisy';


-- ============================================================================
-- CHUNKS
-- Semantic segments of meetings (like YouTube chapters)
-- NOTE: Must be created BEFORE transcript_lines (which references chunks)
-- ============================================================================
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,

  -- Relationships
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,

  -- Position
  sequence_number INTEGER NOT NULL, -- 1, 2, 3... order within meeting
  start_time REAL NOT NULL,         -- Seconds into video
  end_time REAL NOT NULL,

  -- Content
  title TEXT NOT NULL,
  summary TEXT,
  chunk_type TEXT,                  -- 'procedural', 'presentation', 'public_comment', 'vote', 'discussion', 'agenda_item'

  -- Future: Link to official agenda items
  agenda_item_number TEXT,          -- '5.A', '7.B.1', etc. (nullable for now)

  -- Versioning
  processing_version TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint: ensure chunks don't overlap (one sequence number per meeting)
  CONSTRAINT chunks_meeting_sequence_unique UNIQUE(meeting_id, sequence_number)
);

-- Indexes
CREATE INDEX idx_chunks_meeting ON chunks(meeting_id, sequence_number);
CREATE INDEX idx_chunks_type ON chunks(chunk_type);

COMMENT ON TABLE chunks IS 'Semantic segments of meetings - like YouTube chapters but AI-generated based on content';
COMMENT ON COLUMN chunks.sequence_number IS 'Order within meeting (1, 2, 3...) - guaranteed unique per meeting';
COMMENT ON COLUMN chunks.chunk_type IS 'Category of content for filtering/display';


-- ============================================================================
-- TRANSCRIPT_LINES
-- Force-aligned, enriched transcript utterances
-- NOTE: References chunks table (must be created after chunks)
-- ============================================================================
CREATE TABLE transcript_lines (
  id TEXT PRIMARY KEY,

  -- Relationships
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  chunk_id TEXT REFERENCES chunks(id) ON DELETE SET NULL,    -- Assigned after chunking
  speaker_id TEXT REFERENCES speakers(id) ON DELETE SET NULL, -- Nullable if unknown speaker

  -- Content
  start_time REAL NOT NULL,     -- Seconds into video
  end_time REAL NOT NULL,
  text TEXT NOT NULL,

  -- Provenance (for debugging/validation)
  whisperx_speaker_label TEXT, -- 'SPEAKER_00', 'SPEAKER_01', etc. - original WhisperX label
  voiceprint_confidence REAL,  -- 0.0-1.0, quality of speaker match
  was_corrected_by_llm BOOLEAN DEFAULT false,
  correction_reason TEXT,      -- 'introduced_by_name', 'role_context', 'cross_referenced', etc.

  -- Versioning
  processing_version TEXT,     -- 'enrich_v2', etc.

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_transcript_meeting ON transcript_lines(meeting_id);
CREATE INDEX idx_transcript_chunk ON transcript_lines(chunk_id);
CREATE INDEX idx_transcript_speaker ON transcript_lines(speaker_id);
CREATE INDEX idx_transcript_meeting_time ON transcript_lines(meeting_id, start_time);

-- Full-text search index (for future search feature)
CREATE INDEX idx_transcript_text_search ON transcript_lines USING GIN(to_tsvector('english', text));

COMMENT ON TABLE transcript_lines IS 'Enriched transcript with speaker identification and force-aligned timestamps';
COMMENT ON COLUMN transcript_lines.whisperx_speaker_label IS 'Original speaker label from WhisperX (SPEAKER_00, etc.) - kept for debugging';
COMMENT ON COLUMN transcript_lines.was_corrected_by_llm IS 'True if LLM corrected the voiceprint speaker assignment';


-- ============================================================================
-- MEETING_SUMMARIES
-- Top-level meeting overviews
-- ============================================================================
CREATE TABLE meeting_summaries (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,

  -- Content
  summary TEXT NOT NULL,        -- 2-3 paragraph overview of entire meeting
  key_decisions JSONB,          -- Array of decision objects: [{decision: "...", vote: "5-0", ...}]
  key_topics JSONB,             -- Array of topic tags: ["affordable housing", "zoning", "budget"]

  -- Attendance tracking (for future)
  attendees JSONB,              -- Array of speaker_ids who spoke: ["harvey_ward", "david_arreola"]

  -- Versioning
  processing_version TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE meeting_summaries IS 'High-level overview of entire meeting - generated after chunking';
COMMENT ON COLUMN meeting_summaries.key_decisions IS 'JSON array of important decisions/votes made during meeting';
COMMENT ON COLUMN meeting_summaries.attendees IS 'JSON array of speaker_ids who participated (spoke) in meeting';


-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_speakers_updated_at BEFORE UPDATE ON speakers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- HELPER VIEWS (Optional - for convenience)
-- ============================================================================

-- View: Meetings ready for display (fully processed)
CREATE VIEW ready_meetings AS
SELECT
  id,
  title,
  meeting_type,
  date,
  youtube_url,
  duration_seconds,
  processed_at
FROM meetings
WHERE processing_status = 'chunked'
ORDER BY date DESC;

COMMENT ON VIEW ready_meetings IS 'Meetings that have completed full pipeline and are ready for webapp display';


-- ============================================================================
-- INITIAL SEED DATA
-- Known speakers (Gainesville City Commission as of 2025)
-- ============================================================================

INSERT INTO speakers (id, name, role, title, is_active) VALUES
  ('harvey_ward', 'Harvey Ward', 'mayor', 'Mayor', true),
  ('david_arreola', 'David Arreola', 'commissioner', 'Commissioner At-Large', true),
  ('reina_saco', 'Reina Saco', 'commissioner', 'Commissioner District 1', true),
  ('desmon_duncan_walker', 'Desmon Duncan-Walker', 'commissioner', 'Commissioner District 2', true),
  ('bryan_eastman', 'Bryan Eastman', 'commissioner', 'Commissioner District 3', true),
  ('cynthia_moore_chestnut', 'Cynthia Moore Chestnut', 'commissioner', 'Commissioner District 4', true)
ON CONFLICT (id) DO NOTHING;

-- Add common staff speakers (update as you identify them)
INSERT INTO speakers (id, name, role, title, is_active) VALUES
  ('forest_edelton', 'Forest Edelton', 'staff', 'Planning Staff', true),
  ('unknown_speaker', 'Unknown Speaker', 'public', 'Unknown', true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- GRANTS (if using separate read-only user later)
-- ============================================================================
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
