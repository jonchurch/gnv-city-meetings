#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import * as pgDb from '../db/queries.js';
import 'dotenv/config';

const PORT = process.env.PUBLIC_API_PORT || 3002;
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'public-api' });
});

// ============================================================================
// MEETINGS
// ============================================================================

/**
 * GET /api/meetings
 * List meetings with optional filtering and pagination
 *
 * Query params:
 *   - limit: number of results (default: 20)
 *   - offset: pagination offset (default: 0)
 *   - state: filter by processing state
 *   - from_date: filter meetings on or after this date (YYYY-MM-DD)
 *   - to_date: filter meetings on or before this date (YYYY-MM-DD)
 */
app.get('/api/meetings', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const state = req.query.state;
    const fromDate = req.query.from_date;
    const toDate = req.query.to_date;

    const meetings = await pgDb.listMeetings({
      limit,
      offset,
      state,
      fromDate,
      toDate
    });

    res.json({
      data: meetings,
      pagination: {
        limit,
        offset,
        count: meetings.length
      }
    });
  } catch (error) {
    console.error('Error listing meetings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/meetings/:id
 * Get a single meeting with its chunks
 *
 * Returns meeting metadata + array of chunks ordered by sequence
 */
app.get('/api/meetings/:id', async (req, res) => {
  try {
    const meeting = await pgDb.getMeetingWithChunks(req.params.id);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json(meeting);
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/meetings/:id/summary
 * Get meeting-level summary
 */
app.get('/api/meetings/:id/summary', async (req, res) => {
  try {
    const summary = await pgDb.getMeetingSummary(req.params.id);

    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' });
    }

    res.json(summary);
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CHUNKS
// ============================================================================

/**
 * GET /api/chunks/:id
 * Get a single chunk with its transcript lines
 *
 * Returns chunk metadata + array of transcript lines with speaker labels
 */
app.get('/api/chunks/:id', async (req, res) => {
  try {
    const chunk = await pgDb.getChunkWithTranscript(req.params.id);

    if (!chunk) {
      return res.status(404).json({ error: 'Chunk not found' });
    }

    res.json(chunk);
  } catch (error) {
    console.error('Error fetching chunk:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/meetings/:meetingId/chunks
 * Get all chunks for a meeting, ordered by sequence
 */
app.get('/api/meetings/:meetingId/chunks', async (req, res) => {
  try {
    const chunks = await pgDb.getChunks(req.params.meetingId);

    res.json({
      data: chunks,
      count: chunks.length
    });
  } catch (error) {
    console.error('Error fetching chunks:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TRANSCRIPTS
// ============================================================================

/**
 * GET /api/meetings/:meetingId/transcript
 * Get full transcript for a meeting
 */
app.get('/api/meetings/:meetingId/transcript', async (req, res) => {
  try {
    const lines = await pgDb.getTranscriptLines(req.params.meetingId);

    res.json({
      data: lines,
      count: lines.length
    });
  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SPEAKERS
// ============================================================================

/**
 * GET /api/speakers
 * List all speakers
 */
app.get('/api/speakers', async (req, res) => {
  try {
    const speakers = await pgDb.listSpeakers({
      activeOnly: req.query.active_only === 'true'
    });

    res.json({
      data: speakers,
      count: speakers.length
    });
  } catch (error) {
    console.error('Error fetching speakers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/speakers/:id
 * Get a single speaker
 */
app.get('/api/speakers/:id', async (req, res) => {
  try {
    const speaker = await pgDb.getSpeaker(req.params.id);

    if (!speaker) {
      return res.status(404).json({ error: 'Speaker not found' });
    }

    res.json(speaker);
  } catch (error) {
    console.error('Error fetching speaker:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SEARCH
// ============================================================================

/**
 * GET /api/search
 * Full-text search across transcripts
 *
 * Query params:
 *   - q: search query (required)
 *   - meeting_id: limit to specific meeting (optional)
 *   - limit: max results (default: 50)
 */
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const meetingId = req.query.meeting_id;
    const limit = parseInt(req.query.limit) || 50;

    const results = await pgDb.searchTranscripts(query, {
      meetingId,
      limit
    });

    res.json({
      query,
      data: results,
      count: results.length
    });
  } catch (error) {
    console.error('Error searching transcripts:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Public API listening on http://0.0.0.0:${PORT}`);
  console.log(JSON.stringify({
    message: 'Public API started',
    port: PORT,
    step: 'api_start'
  }));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});
