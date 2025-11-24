# Diarization Output Exploration

## Current Status

We now have the diarize-worker running on the gaming PC (GPU-enabled) and processing meetings through WhisperX. The worker successfully runs diarization and writes output files, but we haven't yet examined what that output looks like or whether it meets our needs.

## Goal

Before implementing transcript parsing and storage in PostgreSQL, we need to:

1. **Examine the raw WhisperX output** - Understand the structure, quality, and completeness
2. **Evaluate speaker diarization quality** - Are speakers correctly identified and separated?
3. **Assess timestamp accuracy** - Do timestamps align with video/agenda items?
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

## Notes

- Keep one or two example diarized JSON files in the repo (with sensitive content redacted if needed) for reference
- Consider adding a `transcript_chunk1.txt` file with interesting examples for testing
- GPU worker location: Gaming PC (WSL) - not production setup, temporary for prototyping
