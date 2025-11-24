# Diarization Output Exploration

## Current Status

We now have the diarize-worker running on the gaming PC (GPU-enabled) and processing meetings through WhisperX. The worker successfully runs diarization and writes output files, but we haven't yet examined what that output looks like or whether it meets our needs.

## Goal

Before implementing transcript parsing and storage in PostgreSQL, we need to:

1. **Examine the raw WhisperX output** - Understand the structure, quality, and completeness
4. **Identify data quality issues** - What problems need solving (overlapping speech, background noise, etc.)?
5. **Determine necessary tweaks** - What WhisperX parameters or post-processing might improve results?

## Questions to Answer

### Output Structure
- What format does WhisperX produce? (JSON structure)
- How are speakers labeled? (`SPEAKER_00`, `SPEAKER_01`, etc.?)
- What fields are available per segment? (text, start, end, speaker, confidence, words?)
- Are word-level timestamps included or just segment-level?

### Data Quality
- How accurate is the transcription text?
- Are speakers consistently labeled throughout the meeting?
- Do speaker changes get detected properly?
- Are there issues with:
  - Multiple people talking at once?
  - Background noise/audio quality?
  - Technical jargon or city-specific terminology?
  - Speaker identification across different meetings?

### Alignment with Pipeline Needs
- Can we map transcript segments to agenda items using timestamps?
- Is the granularity appropriate for "semantic chunks"?
- Do we have enough metadata to support:
  - Speaker voiceprinting (for identification across meetings)?
  - Confidence scores for filtering low-quality segments?
  - Timing data for synchronization with video?

## Exploration Steps

### 1. Wait for Diarization to Complete
Monitor the gaming PC worker logs for a completed job:
```bash
# Look for this message:
{"message":"Diarization completed successfully","meeting_id":"...","step":"diarize_complete"}
```

### 2. Locate the Output File
Based on storage paths, diarized output should be at:
```
downloads/derived/diarized/<meeting_id_sanitized>.json
```

### 3. Initial Inspection
```bash
# Pretty-print the JSON
cat downloads/derived/diarized/<meeting_id>.json | jq . | head -100

# Check file size (sanity check)
ls -lh downloads/derived/diarized/<meeting_id>.json

# Count number of segments
cat downloads/derived/diarized/<meeting_id>.json | jq '.segments | length'

# See unique speakers
cat downloads/derived/diarized/<meeting_id>.json | jq '[.segments[].speaker] | unique'
```

### 4. Sample Analysis
Extract a few sample segments to review:
- Opening statements (usually clear, single speaker)
- Public comment sections (multiple speakers, varying quality)
- Board discussion (crosstalk, interruptions)
- Procedural language (motions, votes)

### 5. Cross-Reference with Video/Agenda
Pick a known agenda item with a clear timestamp and check:
- Does the transcript text match what was said?
- Is the speaker correctly identified?
- Do timestamps align with the video?

## Output Schema Considerations

Once we understand the WhisperX output, we need to decide how to map it to our `transcript_lines` table:

```sql
CREATE TABLE transcript_lines (
  line_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  chunk_id BIGINT REFERENCES chunks(chunk_id),
  line_number INTEGER NOT NULL,
  speaker_label TEXT,
  start_time DECIMAL(10,3) NOT NULL,
  end_time DECIMAL(10,3) NOT NULL,
  text TEXT NOT NULL,
  confidence DECIMAL(5,4),
  source_model TEXT NOT NULL,
  source_version TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Mapping Questions
- **line_number**: Sequential per meeting or per chunk?
- **speaker_label**: Use WhisperX labels directly or normalize them?
- **chunk_id**: How do we assign segments to chunks? (NULL for now, populate later?)
- **confidence**: Does WhisperX provide this? At what level (word/segment)?
- **source_version**: Track WhisperX version or our processing pipeline version?

## Potential Issues & Mitigations

### Issue: Poor Speaker Separation
**Symptoms**: Same person labeled as multiple speakers, or multiple people as one speaker

**Possible Solutions**:
- Adjust WhisperX diarization parameters
- Implement speaker voiceprinting to merge/split labels post-processing
- Use video metadata (if available) to identify known speakers

### Issue: Low Transcription Accuracy
**Symptoms**: Garbled text, missing words, technical terms wrong

**Possible Solutions**:
- Improve audio quality preprocessing (noise reduction, normalization)
- Provide custom vocabulary/terms to WhisperX
- Use a different Whisper model size (medium vs large)

### Issue: Timestamp Drift
**Symptoms**: Transcript timestamps don't align with video or agenda

**Possible Solutions**:
- Validate audio extraction process (ensure no re-encoding artifacts)
- Compare diarized timestamps against agenda bookmarks from eScribe
- Implement timestamp correction using known anchor points

### Issue: Missing Speaker Identity
**Symptoms**: Speakers labeled as SPEAKER_00 but we want "Mayor Johnson"

**Possible Solutions**:
- Build speaker voiceprint database over time
- Use meeting roster data from eScribe
- Manual labeling interface for initial training data
- Cross-meeting speaker clustering

## Next Steps (After Exploration)

Once we've examined the output and answered the questions above:

1. **Document findings** - Update this file with actual output structure and quality assessment
2. **Make adjustments** - If needed, tweak WhisperX parameters or add preprocessing
3. **Design parsing logic** - Write `parseDiarizedOutput()` function based on real structure
4. **Implement storage** - Insert parsed data into `transcript_lines` table
5. **Validate** - Query PostgreSQL and spot-check against source video

## Sample WhisperX Output

### Structure Overview
```json
{
  "language": "en",
  "segments": [/* 1092 sentence-level segments */],
  "word_segments": [/* 16,173 individual words */]
}
```

### Sample Segments (General Policy Committee)

**Example 1: Single speaker, clean segment**
```json
{
  "start": 202.7,
  "end": 208.649,
  "text": " Welcome to this General Policy Committee meeting for the City of Gainesville.",
  "words": [
    {
      "word": "Welcome",
      "start": 202.7,
      "end": 204.282,
      "score": 0.666,
      "speaker": "SPEAKER_10"
    },
    // ... 11 more words, all SPEAKER_10
  ],
  "speaker": "SPEAKER_10"
}
```

**Example 2: Multi-speaker within segment (incorrect)**
```json
{
  "start": 265.481,
  "end": 265.701,
  "text": "Very good.",
  "words": [
    {
      "word": "Very",
      "start": 265.481,
      "end": 265.561,
      "score": 0.133,
      "speaker": "SPEAKER_02"  // ← Different speaker!
    },
    {
      "word": "good.",
      "start": 265.581,
      "end": 265.701,
      "score": 0.387,
      "speaker": "SPEAKER_10"  // ← Segment attributed to this speaker
    }
  ],
  "speaker": "SPEAKER_10"
}
```

**Example 3: Mid-sentence speaker change (incorrect)**
```json
{
  "start": 272.533,
  "end": 275.381,
  "text": "All right, we have a motion and a second to approve the minutes.",
  "words": [
    {
      "word": "All",
      "start": 272.533,
      "end": 272.633,
      "score": 0.198,
      "speaker": "SPEAKER_02"  // ← SPEAKER_02 starts
    },
    {
      "word": "right,",
      "start": 272.653,
      "end": 272.773,
      "score": 0.258,
      "speaker": "SPEAKER_02"  // ← Still SPEAKER_02
    },
    {
      "word": "we",
      "start": 273.415,
      "end": 273.536,
      "score": 0.632,
      "speaker": "SPEAKER_10"  // ← SPEAKER_10 takes over mid-sentence!
    },
    {
      "word": "have",
      "start": 273.556,
      "end": 273.636,
      "score": 0.206,
      "speaker": "SPEAKER_10"
    },
    // ... rest of words are SPEAKER_10
    {
      "word": "minutes.",
      "start": 275.221,
      "end": 275.381,
      "score": 0.367,
      "speaker": "SPEAKER_10"
    }
  ],
  "speaker": "SPEAKER_10"
}
```
**Analysis**: SPEAKER_02 says "All right," then SPEAKER_10 continues "we have a motion...". This could be:
- SPEAKER_02 finishing a thought, then SPEAKER_10 summarizing
- Two people speaking in quick succession
- Diarization error (note low confidence: 0.198, 0.258 for first words)

This is actually all Mayor Ward speaking, there wasn't an interruption: https://youtu.be/BeLaq4JEvm8?t=272

**Key observation about multi-speaker segments:**
- Out of 1,092 segments, only ~20-30 have multiple speakers at word level
- These typically have **very low confidence scores** (0.133, 0.387 in examples)
- Likely represents:
  - Diarization uncertainty (low confidence)
  - Overlapping speech / crosstalk
  - One person interrupting another
- If storing only segment-level data, we lose this nuance
- **Decision needed**: Is detecting interruptions/crosstalk important for MVP?

### Observations & Mapping to DB Schema

**Actual `transcript_lines` table schema:**
```sql
CREATE TABLE transcript_lines (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  chunk_id TEXT REFERENCES chunks(id),              -- NULL initially, populated during chunking
  speaker_id TEXT REFERENCES speakers(id),          -- NULL initially, populated during voiceprinting
  start_time REAL NOT NULL,                         -- Seconds into video
  end_time REAL NOT NULL,
  text TEXT NOT NULL,
  whisperx_speaker_label TEXT,                      -- Raw label from WhisperX (SPEAKER_00, etc.)
  voiceprint_confidence REAL,                       -- Quality of speaker match (0.0-1.0)
  was_corrected_by_llm BOOLEAN DEFAULT false,
  correction_reason TEXT,
  processing_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Segment-Level Data Mapping:**
- ✅ `segment.start` → `transcript_lines.start_time`
- ✅ `segment.end` → `transcript_lines.end_time`
- ✅ `segment.text` → `transcript_lines.text`
- ✅ `segment.speaker` → `transcript_lines.whisperx_speaker_label` (store raw label)
- ❓ Confidence: Not at segment level, need to calculate from word scores

**Word-Level Data:**
- 🤔 `words[]` - Very granular, but do we need to store this?
- 🤔 `score` per word - Could compute average for segment confidence
- ⚠️ Speaker changes within segment - what does a high confidence one look like? (a correct one)

**Note on `word_segments` top-level key:**
The `word_segments` array is a flattened view of all words from all segments - it's the same data as `segments[].words`, just denormalized for convenience. No need to store both.

**Questions to Answer:**

1. **Do we store word-level data?**
   - **Pro**: Maximum granularity, enables word-level search/highlighting, detect mid-segment speaker changes
   - **Con**: 16,173 words vs 1,092 segments = 15x more rows
   - **Decision needed**: Are segments sufficient for our use case?
   - **Note**: Word-level speaker changes appear to be mostly diarization errors (see examples with low confidence)

2. **How to calculate confidence for `voiceprint_confidence` field?**
   - Schema has `voiceprint_confidence` but that's for future speaker identification
   - WhisperX gives word-level confidence scores, not segment-level
   - Options:
     ```javascript
     // Option A: Average word scores (represents overall quality)
     confidence = words.reduce((sum, w) => sum + w.score, 0) / words.length

     // Option B: Minimum word score (conservative, weakest link)
     confidence = Math.min(...words.map(w => w.score))
     ```
   - **Decision**: Store as `voiceprint_confidence` initially? Or add a new field for transcription confidence?

3. **ID generation strategy?**
   - Schema uses `id TEXT PRIMARY KEY` (not auto-incrementing)
   - Options:
     - UUIDs: `crypto.randomUUID()`
     - Deterministic: `${meetingId}_${startTime}` (allows re-processing without duplicates)
     - Compound: `${meetingId}_line_${sequenceNumber}`

4. **Speaker identification pipeline?**
   - Store `whisperx_speaker_label = "SPEAKER_10"` ✅
   - Leave `speaker_id = NULL` initially ✅
   - Populate later via voiceprinting/manual tagging
   - Schema designed for this: separate `speaker_id` foreign key

5. **Chunk assignment (`chunk_id`)?**
   - NULL for initial import ✅
   - Populate later when we implement chunking logic
   - Use agenda timestamps to assign segments to chunks

### Proposed Initial Mapping

**For MVP, store only segment-level data:**

```javascript
import { randomUUID } from 'crypto';

function parseSegmentToTranscriptLine(segment, meetingId, segmentIndex) {
  return {
    id: `${meetingId}_seg_${segmentIndex}`,  // Deterministic ID for idempotency
    meeting_id: meetingId,
    chunk_id: null,                           // Populate later via chunking pipeline
    speaker_id: null,                         // Populate later via voiceprinting
    start_time: segment.start,
    end_time: segment.end,
    text: segment.text.trim(),
    whisperx_speaker_label: segment.speaker, // Store raw WhisperX label (SPEAKER_00, SPEAKER_01, etc.)
    voiceprint_confidence: null,              // Populate later when speaker_id is matched
    was_corrected_by_llm: false,
    correction_reason: null,
    processing_version: 'whisperx_large-v3_initial'
  };
}

// Note: WhisperX provides word-level confidence scores (segment.words[].score)
// but we're not storing those for now. Could be useful for:
// - Filtering low-quality transcription
// - Highlighting uncertain words in UI
// - Prioritizing segments for manual review
// Decision: Skip for MVP, can add later if needed
```

**Alternative: Use UUIDs instead of deterministic IDs**
```javascript
id: randomUUID()  // If we don't need idempotent re-processing
```

**This gives us:**
- 1,092 transcript_lines per meeting (manageable scale)
- All essential data for semantic search and navigation
- Raw WhisperX speaker labels preserved (`whisperx_speaker_label`)
- Timestamps for sync with video/agenda
- Clear pipeline for future enrichment:
  1. **Initial: Store WhisperX output** ✅ (this phase)
  2. **Chunking**: Populate `chunk_id` based on agenda timestamps
  3. **Voiceprinting**: Populate `speaker_id` and `voiceprint_confidence` via voice matching
  4. **LLM correction**: Update `was_corrected_by_llm` if text is cleaned up
- Word-level confidence scores available in raw JSON if needed later
- Path forward: Can always add word-level table later if needed

## Notes

- ✅ Sample diarized JSON files committed to repo: `General_Policy_Committee_diarized.json`, `Finance_Committee_diarized.json`
- ✅ Sample segments extracted: `sample_segments.json`
- GPU worker location: Gaming PC (WSL) - not production setup, temporary for prototyping
- Meeting starts at ~202 seconds (3+ minutes of silence/pre-meeting audio)
