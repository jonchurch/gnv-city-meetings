#!/usr/bin/env node
import { createWorker, createQueue, connection } from '../queue/config.js';
import { advanceWorkflow, handleWorkflowFailure } from '../workflow/orchestrator.js';
import { QUEUE_NAMES } from '../workflow/config.js';
import * as pgDb from '../db/queries.js';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { pathFor, StorageTypes } from '../storage/paths.js';
import { promises as fs } from 'fs';
import path from 'path';
import 'dotenv/config';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Zod schema for chunk output
const ChunkSchema = z.object({
  sequence_number: z.number().int().positive(),
  start_segment_index: z.number().int().nonnegative(),
  end_segment_index: z.number().int().nonnegative(),
  title: z.string().min(1).max(100),
  summary: z.string().min(1),
  chunk_type: z.enum(['procedural', 'presentation', 'discussion', 'public_comment', 'vote']),
  key_topics: z.array(z.string()).nullable().optional(),
});

const ChunksResponseSchema = z.object({
  chunks: z.array(ChunkSchema),
});

/**
 * Format transcript lines for LLM input
 * @param {Array<Object>} transcriptLines
 * @returns {string}
 */
function formatTranscriptForLLM(transcriptLines) {
  return transcriptLines
    .map((line, idx) => {
      const startMin = Math.floor(line.start_time / 60);
      const startSec = Math.floor(line.start_time % 60);
      const endMin = Math.floor(line.end_time / 60);
      const endSec = Math.floor(line.end_time % 60);

      return `[${idx}] ${startMin}:${startSec.toString().padStart(2, '0')} - ${endMin}:${endSec.toString().padStart(2, '0')} | ${line.whisperx_speaker_label}: ${line.text.trim()}`;
    })
    .join('\n');
}

/**
 * Call OpenAI to generate chunks for a meeting transcript
 * @param {Array<Object>} transcriptLines
 * @param {string} meetingId - Meeting ID for saving debug output
 * @returns {Promise<Array<Object>>}
 */
async function generateChunks(transcriptLines, meetingId) {
  const formattedTranscript = formatTranscriptForLLM(transcriptLines);

  const systemPrompt = `You are helping to create semantic chunks for a city government meeting video, similar to YouTube chapters. Your goal is to identify natural segments within the provided transcript that would help users navigate to specific topics or discussion phases.

Analyze the transcript and identify distinct chunks based on:

1. **Topic changes** - When does the subject matter shift significantly?
2. **Speaker patterns** - When does it change from presentation (monologue) to Q&A (dialogue) to discussion?
3. **Natural transitions** - Look for phrases like "Before I move to...", "Any questions?", "Next I want to..."
4. **Content purpose** - Is this procedural (votes, roll call), presentation (staff explaining), questions, or member comments?

**Guidelines:**
- Aim for chunks between 1-5 minutes each (not too granular, not too coarse)
- **For presentations:** Break into sub-topics if the presentation covers multiple distinct subjects (e.g., "Team Introductions" vs "Budget Details" are separate chunks)
- **Avoid over-chunking:** Don't create a new chunk for every speaker change within the same discussion
- **Procedural moments** (votes, roll calls, agenda item introductions) should be separate from substantive content
- **Title format:** Clear and scannable (e.g., "Commissioner Questions: Security Auditing" not "Discussion")

**Important:** Use the segment index numbers (from the brackets) to specify which segments belong to each chunk. For example, if a chunk includes segments [0] through [9], set start_segment_index: 0 and end_segment_index: 9.`;

  const response = await openai.responses.parse({
    model: 'gpt-5.1',
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here is the transcript to chunk:\n\n${formattedTranscript}` },
    ],
    text: {
      format: zodTextFormat(ChunksResponseSchema, 'chunks_response'),
    },
  });

  // Log token usage
  console.log(JSON.stringify({
    message: 'LLM chunking complete',
    usage: response.usage,
    chunk_count: response.output_parsed.chunks.length,
    step: 'chunking_llm_usage'
  }));

  // Save LLM response to storage for debugging
  const debugData = {
    input_segment_count: transcriptLines.length,
    output: response.output_parsed,
    usage: response.usage
  };

  const chunksPath = pathFor(StorageTypes.DERIVED_CHUNKS, meetingId);
  await fs.mkdir(path.dirname(chunksPath), { recursive: true });
  await fs.writeFile(chunksPath, JSON.stringify(debugData, null, 2));

  console.log(JSON.stringify({
    message: 'Saved LLM response to storage',
    meeting_id: meetingId,
    path: chunksPath,
    step: 'chunking_debug'
  }));

  return response.output_parsed.chunks;
}

/**
 * Validate chunks against transcript lines
 * @param {Array<Object>} chunks
 * @param {number} totalSegments
 * @returns {Array<string>} - Array of error messages (empty if valid)
 */
function validateChunks(chunks, totalSegments) {
  const errors = [];
  const assigned = new Set();

  // Check each chunk
  chunks.forEach((chunk, idx) => {
    if (chunk.start_segment_index > chunk.end_segment_index) {
      errors.push(`Chunk ${idx}: start_segment_index (${chunk.start_segment_index}) > end_segment_index (${chunk.end_segment_index})`);
    }

    if (chunk.start_segment_index < 0 || chunk.end_segment_index >= totalSegments) {
      errors.push(`Chunk ${idx}: segment indexes out of range (0-${totalSegments - 1})`);
    }

    // Check for overlaps
    for (let i = chunk.start_segment_index; i <= chunk.end_segment_index; i++) {
      if (assigned.has(i)) {
        errors.push(`Chunk ${idx}: segment ${i} already assigned to another chunk`);
      }
      assigned.add(i);
    }
  });

  // Check for gaps (warn but don't fail)
  for (let i = 0; i < totalSegments; i++) {
    if (!assigned.has(i)) {
      console.warn(`Warning: Segment ${i} not assigned to any chunk`);
    }
  }

  return errors;
}

/**
 * Process a chunking job
 * @param {Object} job - BullMQ job
 */
async function processChunkingJob(job) {
  const { meetingId } = job.data;

  console.log(JSON.stringify({
    message: 'Starting chunking job',
    meeting_id: meetingId,
    job_id: job.id,
    step: 'chunking_start'
  }));

  try {
    // 1. Fetch transcript lines
    console.log(JSON.stringify({
      message: 'Fetching transcript lines',
      meeting_id: meetingId,
      step: 'chunking_fetch'
    }));

    const transcriptLines = await pgDb.getTranscriptLines(meetingId);

    if (!transcriptLines || transcriptLines.length === 0) {
      throw new Error(`No transcript lines found for meeting ${meetingId}`);
    }

    console.log(JSON.stringify({
      message: 'Transcript lines fetched',
      meeting_id: meetingId,
      line_count: transcriptLines.length,
      step: 'chunking_fetched'
    }));

    // 2. Call LLM to generate chunks
    console.log(JSON.stringify({
      message: 'Calling LLM to generate chunks',
      meeting_id: meetingId,
      step: 'chunking_llm_start'
    }));

    const chunks = await generateChunks(transcriptLines, meetingId);

    console.log(JSON.stringify({
      message: 'LLM returned chunks',
      meeting_id: meetingId,
      chunk_count: chunks.length,
      step: 'chunking_llm_complete'
    }));

    // 3. Validate chunks
    const validationErrors = validateChunks(chunks, transcriptLines.length);
    if (validationErrors.length > 0) {
      throw new Error(`Chunk validation failed: ${validationErrors.join(', ')}`);
    }

    // 4. Insert chunks into database
    console.log(JSON.stringify({
      message: 'Inserting chunks into database',
      meeting_id: meetingId,
      chunk_count: chunks.length,
      step: 'chunking_insert_start'
    }));

    const chunksToInsert = chunks.map((chunk) => {
      const startLine = transcriptLines[chunk.start_segment_index];
      const endLine = transcriptLines[chunk.end_segment_index];

      return {
        id: `${meetingId}_chunk_${chunk.sequence_number}`,
        meeting_id: meetingId,
        sequence_number: chunk.sequence_number,
        start_time: startLine.start_time,
        end_time: endLine.end_time,
        title: chunk.title,
        summary: chunk.summary,
        chunk_type: chunk.chunk_type,
        agenda_item_number: null,
      };
    });

    await pgDb.insertChunks(meetingId, chunksToInsert, 'chunking_v1_gpt4o');

    // 5. Assign transcript lines to chunks
    console.log(JSON.stringify({
      message: 'Assigning transcript lines to chunks',
      meeting_id: meetingId,
      step: 'chunking_assign_start'
    }));

    for (const chunk of chunks) {
      const chunkId = `${meetingId}_chunk_${chunk.sequence_number}`;
      await pgDb.assignChunkBySegmentIndexes(
        meetingId,
        chunkId,
        chunk.start_segment_index,
        chunk.end_segment_index
      );
    }

    console.log(JSON.stringify({
      message: 'Transcript lines assigned to chunks',
      meeting_id: meetingId,
      step: 'chunking_assign_complete'
    }));

    // 6. Update meeting status
    await pgDb.updateMeeting(meetingId, {
      processing_status: 'chunked'
    });

    // 7. Advance workflow
    await advanceWorkflow(meetingId, 'DIARIZED');

    console.log(JSON.stringify({
      message: 'Chunking completed successfully',
      meeting_id: meetingId,
      job_id: job.id,
      chunk_count: chunks.length,
      step: 'chunking_complete'
    }));

  } catch (error) {
    console.error(JSON.stringify({
      message: 'Chunking job failed',
      meeting_id: meetingId,
      job_id: job.id,
      error: error.message,
      step: 'chunking_error'
    }));

    await handleWorkflowFailure(meetingId, 'DIARIZED', error);
    throw error;
  }
}

async function main() {
  console.log(JSON.stringify({
    message: 'Starting chunking worker',
    queue: QUEUE_NAMES.CHUNK,
    step: 'worker_start'
  }));

  if (!process.env.OPENAI_API_KEY) {
    console.error(JSON.stringify({
      message: 'OPENAI_API_KEY environment variable is required',
      step: 'worker_config_error'
    }));
    process.exit(1);
  }

  const worker = createWorker(QUEUE_NAMES.CHUNK, processChunkingJob, {
    concurrency: 1,
  });

  const chunkQueue = createQueue(QUEUE_NAMES.CHUNK);

  worker.on('completed', async (job) => {
    console.log(JSON.stringify({
      message: 'Chunking job completed',
      job_id: job.id,
      meeting_id: job.data.meetingId,
      step: 'worker_event'
    }));
  });

  worker.on('failed', (job, err) => {
    console.error(JSON.stringify({
      message: 'Chunking job failed',
      job_id: job.id,
      meeting_id: job.data?.meetingId || 'unknown',
      error: err.message,
      step: 'worker_event'
    }));
  });

  worker.on('error', (err) => {
    console.error(JSON.stringify({
      message: 'Worker error',
      error: err.message,
      step: 'worker_error'
    }));
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log(JSON.stringify({
      message: 'Received SIGTERM, closing worker',
      step: 'worker_shutdown'
    }));
    await worker.close();
    await chunkQueue.close();
    await connection.quit();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log(JSON.stringify({
      message: 'Received SIGINT, closing worker',
      step: 'worker_shutdown'
    }));
    await worker.close();
    await chunkQueue.close();
    await connection.quit();
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(JSON.stringify({
      message: 'Fatal worker error',
      error: error.message,
      stack: error.stack,
      step: 'worker_fatal'
    }));
    process.exit(1);
  });
}
