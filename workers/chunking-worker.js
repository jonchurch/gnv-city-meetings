#!/usr/bin/env node
import 'dotenv/config';
import { createWorker, createQueue, connection } from '../queue/config.js';
import { advanceWorkflow, handleWorkflowFailure } from '../workflow/orchestrator.js';
import { QUEUE_NAMES } from '../workflow/config.js';
import * as pgDb from '../db/queries.js';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { pathFor, StorageTypes } from '../storage/paths.js';
import { formatTranscriptForLLM } from './utils.js';
import {
  CHUNKING_MODEL,
  ChunksResponseSchema,
  WHOLE_MEETING_SYSTEM_PROMPT,
  buildUserMessage,
  validateChunkCoverage,
} from './chunking-shared.js';
import { promises as fs } from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Call OpenAI to generate chunks for a meeting transcript
 * @param {Array<Object>} transcriptLines
 * @param {string} meetingId - Meeting ID for saving debug output
 * @returns {Promise<Array<Object>>}
 */
async function generateChunks(transcriptLines, meetingId) {
  const formattedTranscript = formatTranscriptForLLM(transcriptLines);

  const response = await openai.responses.parse({
    model: CHUNKING_MODEL,
    input: [
      { role: 'system', content: WHOLE_MEETING_SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(formattedTranscript) },
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
  const { errors, gaps } = validateChunkCoverage(chunks, 0, totalSegments - 1);

  // Gaps still warn rather than fail here, pending an auto-repair strategy
  for (const gap of gaps) {
    console.warn(`Warning: Segments ${gap.start}-${gap.end} not assigned to any chunk`);
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
