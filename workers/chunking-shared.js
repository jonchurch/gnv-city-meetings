import { z } from 'zod';

// Single source of truth for the chunking LLM contract, shared by the
// chunking worker and the dry-run harness (scripts/chunking/).

export const CHUNKING_MODEL = process.env.CHUNKING_MODEL || 'gpt-5.1';

export const ChunkSchema = z.object({
  sequence_number: z.number().int().positive(),
  start_segment_index: z.number().int().nonnegative(),
  end_segment_index: z.number().int().nonnegative(),
  title: z.string().min(1).max(100),
  summary: z.string().min(1),
  chunk_type: z.enum(['procedural', 'presentation', 'discussion', 'public_comment', 'vote']),
  key_topics: z.array(z.string()).nullable().optional(),
});

export const ChunksResponseSchema = z.object({
  chunks: z.array(ChunkSchema),
});

// The shared core of both prompts. A chunk is the unit a citizen pages
// through: a stretch of meeting whose 2-3 sentence summary can cover it
// without losing a point someone would care about. The summaries, read in
// order, should function as the short version of the meeting.
const CORE_GUIDELINES = `Analyze the transcript and identify distinct chunks based on:

1. **Topic changes** - When does the subject matter shift significantly?
2. **Speaker patterns** - When does it change from presentation (monologue) to Q&A (dialogue) to discussion?
3. **Natural transitions** - Look for phrases like "Before I move to...", "Any questions?", "Next I want to..."
4. **Content purpose** - Is this procedural (votes, roll call), presentation (staff explaining), questions, or member comments?

**Guidelines:**
- A chunk should be one self-contained beat: a stretch whose 2-3 sentence summary covers it honestly, without needing "and then also...". This usually lands between 1-5 minutes.
- **For presentations:** Break into sub-topics if the presentation covers multiple distinct subjects (e.g., "Team Introductions" vs "Budget Details" are separate chunks)
- **Avoid over-chunking:** Don't create a new chunk for every speaker change within the same discussion
- **Procedural moments** (votes, roll calls, agenda item introductions) should be separate from substantive content
- **Title format:** Clear and scannable (e.g., "Commissioner Questions: Security Auditing" not "Discussion")
- **Summaries:** 2-3 sentences capturing the substance (positions taken, numbers cited, outcomes) - a reader skimming only the summaries in order should still understand what was discussed.

**Important:** Use the segment index numbers (from the brackets) to specify which segments belong to each chunk. For example, if a chunk includes segments [0] through [9], set start_segment_index: 0 and end_segment_index: 9. Chunks must be contiguous and non-overlapping, and together must cover every segment shown.`;

export const WHOLE_MEETING_SYSTEM_PROMPT = `You are helping to create semantic chunks for a city government meeting video, similar to YouTube chapters. Your goal is to identify natural segments within the provided transcript that would help users navigate to specific topics or discussion phases.

${CORE_GUIDELINES}`;

/**
 * System prompt for chunking a single agenda-item section of a meeting.
 * The section's segment indices are global to the meeting and must be
 * used as-is so per-section results can be merged.
 * @param {{title: string, isAgendaItem: boolean}} section
 * @param {{firstIndex: number, lastIndex: number}} range
 * @returns {string}
 */
export function buildSectionSystemPrompt(section, range) {
  const sectionContext = section.isAgendaItem
    ? `The transcript below is the portion of the meeting covering one official agenda item: "${section.title}". The item's boundaries come from the official meeting record; your job is only to subdivide it.`
    : `The transcript below is a portion of the meeting that falls outside the timestamped agenda items ("${section.title}") - typically things like call to order, general public comment, breaks, or closing remarks.`;

  return `You are helping to create semantic chunks for a city government meeting video, similar to YouTube chapters. Your goal is to identify natural segments within the provided transcript that would help users navigate to specific topics or discussion phases.

${sectionContext}

${CORE_GUIDELINES}

The segment indices shown are global to the full meeting. Your chunks must cover exactly segments [${range.firstIndex}] through [${range.lastIndex}].`;
}

/**
 * User message wrapping the formatted transcript (shared by both strategies).
 * @param {string} formattedTranscript
 * @returns {string}
 */
export function buildUserMessage(formattedTranscript) {
  return `Here is the transcript to chunk:\n\n${formattedTranscript}`;
}

/**
 * Validate chunks against a segment index range.
 * Returns structured results instead of logging, so callers decide
 * whether gaps are warnings (worker, for now) or reportable defects (harness).
 * @param {Array<Object>} chunks
 * @param {number} firstIndex - first valid segment index (inclusive)
 * @param {number} lastIndex - last valid segment index (inclusive)
 * @returns {{errors: string[], gaps: Array<{start: number, end: number}>}}
 */
export function validateChunkCoverage(chunks, firstIndex, lastIndex) {
  const errors = [];
  const assigned = new Set();

  chunks.forEach((chunk, idx) => {
    if (chunk.start_segment_index > chunk.end_segment_index) {
      errors.push(`Chunk ${idx}: start_segment_index (${chunk.start_segment_index}) > end_segment_index (${chunk.end_segment_index})`);
    }

    if (chunk.start_segment_index < firstIndex || chunk.end_segment_index > lastIndex) {
      errors.push(`Chunk ${idx}: segment indexes out of range (${firstIndex}-${lastIndex})`);
    }

    for (let i = chunk.start_segment_index; i <= chunk.end_segment_index; i++) {
      if (assigned.has(i)) {
        errors.push(`Chunk ${idx}: segment ${i} already assigned to another chunk`);
      }
      assigned.add(i);
    }
  });

  const gaps = [];
  let gapStart = null;
  for (let i = firstIndex; i <= lastIndex; i++) {
    if (!assigned.has(i)) {
      if (gapStart === null) gapStart = i;
    } else if (gapStart !== null) {
      gaps.push({ start: gapStart, end: i - 1 });
      gapStart = null;
    }
  }
  if (gapStart !== null) gaps.push({ start: gapStart, end: lastIndex });

  return { errors, gaps };
}
