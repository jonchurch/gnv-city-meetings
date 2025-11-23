/**
 * Database query helpers for GNV City Meetings
 *
 * Provides a clean API for database operations without exposing raw SQL
 * throughout the codebase.
 */

import { query, getClient } from './client.js';

// ============================================================================
// MEETINGS
// ============================================================================

/**
 * List meetings with optional filtering
 * @param {Object} options
 * @param {string} options.meeting_type - Filter by meeting type
 * @param {string} options.status - Filter by processing status
 * @param {number} options.limit - Max results (default: 50)
 * @param {number} options.offset - Pagination offset (default: 0)
 * @returns {Promise<Array>}
 */
export async function listMeetings(options = {}) {
  const {
    meeting_type,
    status,
    limit = 50,
    offset = 0,
  } = options;

  let sql = 'SELECT * FROM meetings WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (meeting_type) {
    paramCount++;
    sql += ` AND meeting_type = $${paramCount}`;
    params.push(meeting_type);
  }

  if (status) {
    paramCount++;
    sql += ` AND processing_status = $${paramCount}`;
    params.push(status);
  }

  sql += ' ORDER BY date DESC';

  paramCount++;
  sql += ` LIMIT $${paramCount}`;
  params.push(limit);

  paramCount++;
  sql += ` OFFSET $${paramCount}`;
  params.push(offset);

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get a single meeting by ID
 * @param {string} meetingId
 * @returns {Promise<Object|null>}
 */
export async function getMeeting(meetingId) {
  const result = await query(
    'SELECT * FROM meetings WHERE id = $1',
    [meetingId]
  );
  return result.rows[0] || null;
}

/**
 * Get meeting with all chunks and summary
 * @param {string} meetingId
 * @returns {Promise<Object|null>}
 */
export async function getMeetingWithChunks(meetingId) {
  const sql = `
    SELECT
      m.*,
      ms.summary as meeting_summary,
      ms.key_decisions,
      ms.key_topics,
      COALESCE(
        json_agg(
          json_build_object(
            'id', c.id,
            'sequence_number', c.sequence_number,
            'start_time', c.start_time,
            'end_time', c.end_time,
            'title', c.title,
            'summary', c.summary,
            'chunk_type', c.chunk_type,
            'agenda_item_number', c.agenda_item_number
          ) ORDER BY c.sequence_number
        ) FILTER (WHERE c.id IS NOT NULL),
        '[]'
      ) as chunks
    FROM meetings m
    LEFT JOIN meeting_summaries ms ON ms.meeting_id = m.id
    LEFT JOIN chunks c ON c.meeting_id = m.id
    WHERE m.id = $1
    GROUP BY m.id, ms.summary, ms.key_decisions, ms.key_topics
  `;

  const result = await query(sql, [meetingId]);
  return result.rows[0] || null;
}

/**
 * Insert or update a meeting
 * @param {Object} meeting
 * @returns {Promise<Object>} - The inserted/updated meeting
 */
export async function upsertMeeting(meeting) {
  const {
    id,
    title,
    meeting_type,
    date,
    duration_seconds,
    escribe_url,
    youtube_url,
    video_path,
    audio_path,
    escribe_agenda_path,
    escribe_transcript_path,
    processing_status = 'discovered',
    processing_version,
    processed_at,
    error_message,
  } = meeting;

  const sql = `
    INSERT INTO meetings (
      id, title, meeting_type, date, duration_seconds,
      escribe_url, youtube_url, video_path, audio_path,
      escribe_agenda_path, escribe_transcript_path,
      processing_status, processing_version, processed_at, error_message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      meeting_type = EXCLUDED.meeting_type,
      date = EXCLUDED.date,
      duration_seconds = EXCLUDED.duration_seconds,
      escribe_url = EXCLUDED.escribe_url,
      youtube_url = EXCLUDED.youtube_url,
      video_path = EXCLUDED.video_path,
      audio_path = EXCLUDED.audio_path,
      escribe_agenda_path = EXCLUDED.escribe_agenda_path,
      escribe_transcript_path = EXCLUDED.escribe_transcript_path,
      processing_status = EXCLUDED.processing_status,
      processing_version = EXCLUDED.processing_version,
      processed_at = EXCLUDED.processed_at,
      error_message = EXCLUDED.error_message,
      updated_at = NOW()
    RETURNING *
  `;

  const result = await query(sql, [
    id, title, meeting_type, date, duration_seconds,
    escribe_url, youtube_url, video_path, audio_path,
    escribe_agenda_path, escribe_transcript_path,
    processing_status, processing_version, processed_at, error_message,
  ]);

  return result.rows[0];
}

/**
 * Update specific fields on a meeting (partial update)
 * @param {string} meetingId
 * @param {Object} fields - Fields to update (e.g., { video_path: '...', processing_status: 'downloaded' })
 * @returns {Promise<Object>}
 */
export async function updateMeeting(meetingId, fields) {
  const setClauses = [];
  const values = [meetingId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No fields to update');
  }

  setClauses.push('updated_at = NOW()');

  const sql = `UPDATE meetings SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Update meeting processing status
 * @param {string} meetingId
 * @param {string} status
 * @param {Object} options - Additional fields to update
 * @returns {Promise<Object>}
 */
export async function updateMeetingStatus(meetingId, status, options = {}) {
  const {
    processing_version,
    error_message,
  } = options;

  const sql = `
    UPDATE meetings
    SET processing_status = $2,
        processing_version = COALESCE($3, processing_version),
        error_message = $4,
        processed_at = CASE WHEN $2 IN ('chunked', 'failed') THEN NOW() ELSE processed_at END,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [meetingId, status, processing_version, error_message]);
  return result.rows[0];
}

// ============================================================================
// SPEAKERS
// ============================================================================

/**
 * Get all speakers
 * @param {Object} options
 * @param {boolean} options.activeOnly - Only return active speakers
 * @returns {Promise<Array>}
 */
export async function listSpeakers(options = {}) {
  const { activeOnly = false } = options;

  let sql = 'SELECT * FROM speakers';
  if (activeOnly) {
    sql += ' WHERE is_active = true';
  }
  sql += ' ORDER BY role, name';

  const result = await query(sql);
  return result.rows;
}

/**
 * Get speaker by ID
 * @param {string} speakerId
 * @returns {Promise<Object|null>}
 */
export async function getSpeaker(speakerId) {
  const result = await query('SELECT * FROM speakers WHERE id = $1', [speakerId]);
  return result.rows[0] || null;
}

/**
 * Insert or update a speaker
 * @param {Object} speaker
 * @returns {Promise<Object>}
 */
export async function upsertSpeaker(speaker) {
  const { id, name, role, title, is_active = true } = speaker;

  const sql = `
    INSERT INTO speakers (id, name, role, title, is_active)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      title = EXCLUDED.title,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING *
  `;

  const result = await query(sql, [id, name, role, title, is_active]);
  return result.rows[0];
}

// ============================================================================
// CHUNKS
// ============================================================================

/**
 * Get all chunks for a meeting
 * @param {string} meetingId
 * @returns {Promise<Array>}
 */
export async function getChunks(meetingId) {
  const result = await query(
    'SELECT * FROM chunks WHERE meeting_id = $1 ORDER BY sequence_number',
    [meetingId]
  );
  return result.rows;
}

/**
 * Get a single chunk with its transcript
 * @param {string} chunkId
 * @returns {Promise<Object|null>}
 */
export async function getChunkWithTranscript(chunkId) {
  const sql = `
    SELECT
      c.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', tl.id,
            'start_time', tl.start_time,
            'end_time', tl.end_time,
            'text', tl.text,
            'speaker', json_build_object(
              'id', s.id,
              'name', s.name,
              'role', s.role,
              'title', s.title
            ),
            'whisperx_speaker_label', tl.whisperx_speaker_label,
            'voiceprint_confidence', tl.voiceprint_confidence,
            'was_corrected_by_llm', tl.was_corrected_by_llm
          ) ORDER BY tl.start_time
        ) FILTER (WHERE tl.id IS NOT NULL),
        '[]'
      ) as transcript_lines
    FROM chunks c
    LEFT JOIN transcript_lines tl ON tl.chunk_id = c.id
    LEFT JOIN speakers s ON tl.speaker_id = s.id
    WHERE c.id = $1
    GROUP BY c.id
  `;

  const result = await query(sql, [chunkId]);
  return result.rows[0] || null;
}

/**
 * Insert chunks for a meeting (bulk insert)
 * @param {string} meetingId
 * @param {Array<Object>} chunks
 * @param {string} processingVersion
 * @returns {Promise<Array>}
 */
export async function insertChunks(meetingId, chunks, processingVersion) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Delete existing chunks for this meeting/version
    await client.query(
      'DELETE FROM chunks WHERE meeting_id = $1 AND processing_version = $2',
      [meetingId, processingVersion]
    );

    // Insert new chunks
    const insertedChunks = [];
    for (const chunk of chunks) {
      const result = await client.query(
        `INSERT INTO chunks (
          id, meeting_id, sequence_number, start_time, end_time,
          title, summary, chunk_type, agenda_item_number, processing_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          chunk.id,
          meetingId,
          chunk.sequence_number,
          chunk.start_time,
          chunk.end_time,
          chunk.title,
          chunk.summary,
          chunk.chunk_type,
          chunk.agenda_item_number || null,
          processingVersion,
        ]
      );
      insertedChunks.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return insertedChunks;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// TRANSCRIPT LINES
// ============================================================================

/**
 * Get all transcript lines for a meeting
 * @param {string} meetingId
 * @returns {Promise<Array>}
 */
export async function getTranscriptLines(meetingId) {
  const sql = `
    SELECT
      tl.*,
      s.name as speaker_name,
      s.role as speaker_role
    FROM transcript_lines tl
    LEFT JOIN speakers s ON tl.speaker_id = s.id
    WHERE tl.meeting_id = $1
    ORDER BY tl.start_time
  `;

  const result = await query(sql, [meetingId]);
  return result.rows;
}

/**
 * Insert transcript lines for a meeting (bulk insert)
 * @param {string} meetingId
 * @param {Array<Object>} lines
 * @param {string} processingVersion
 * @returns {Promise<number>} - Number of lines inserted
 */
export async function insertTranscriptLines(meetingId, lines, processingVersion) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Delete existing transcript lines for this meeting/version
    await client.query(
      'DELETE FROM transcript_lines WHERE meeting_id = $1 AND processing_version = $2',
      [meetingId, processingVersion]
    );

    // Bulk insert new lines
    let insertedCount = 0;
    for (const line of lines) {
      await client.query(
        `INSERT INTO transcript_lines (
          id, meeting_id, chunk_id, speaker_id, start_time, end_time, text,
          whisperx_speaker_label, voiceprint_confidence,
          was_corrected_by_llm, correction_reason, processing_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          line.id,
          meetingId,
          line.chunk_id || null,
          line.speaker_id || null,
          line.start_time,
          line.end_time,
          line.text,
          line.whisperx_speaker_label || null,
          line.voiceprint_confidence || null,
          line.was_corrected_by_llm || false,
          line.correction_reason || null,
          processingVersion,
        ]
      );
      insertedCount++;
    }

    await client.query('COMMIT');
    return insertedCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Assign chunk IDs to transcript lines based on time ranges
 * @param {string} meetingId
 * @param {Array<{chunkId: string, startTime: number, endTime: number}>} chunkRanges
 * @returns {Promise<number>} - Number of lines updated
 */
export async function assignChunksToTranscriptLines(meetingId, chunkRanges) {
  let updatedCount = 0;

  for (const range of chunkRanges) {
    const result = await query(
      `UPDATE transcript_lines
       SET chunk_id = $1
       WHERE meeting_id = $2
         AND start_time >= $3
         AND start_time < $4`,
      [range.chunkId, meetingId, range.startTime, range.endTime]
    );
    updatedCount += result.rowCount;
  }

  return updatedCount;
}

// ============================================================================
// MEETING SUMMARIES
// ============================================================================

/**
 * Get meeting summary
 * @param {string} meetingId
 * @returns {Promise<Object|null>}
 */
export async function getMeetingSummary(meetingId) {
  const result = await query(
    'SELECT * FROM meeting_summaries WHERE meeting_id = $1',
    [meetingId]
  );
  return result.rows[0] || null;
}

/**
 * Insert or update meeting summary
 * @param {string} meetingId
 * @param {Object} summary
 * @returns {Promise<Object>}
 */
export async function upsertMeetingSummary(meetingId, summary) {
  const {
    summary: summaryText,
    key_decisions,
    key_topics,
    attendees,
    processing_version,
  } = summary;

  const sql = `
    INSERT INTO meeting_summaries (
      meeting_id, summary, key_decisions, key_topics, attendees, processing_version
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (meeting_id) DO UPDATE SET
      summary = EXCLUDED.summary,
      key_decisions = EXCLUDED.key_decisions,
      key_topics = EXCLUDED.key_topics,
      attendees = EXCLUDED.attendees,
      processing_version = EXCLUDED.processing_version,
      created_at = NOW()
    RETURNING *
  `;

  const result = await query(sql, [
    meetingId,
    summaryText,
    JSON.stringify(key_decisions),
    JSON.stringify(key_topics),
    JSON.stringify(attendees),
    processing_version,
  ]);

  return result.rows[0];
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Full-text search across transcript lines
 * @param {string} searchQuery
 * @param {Object} options
 * @param {number} options.limit
 * @returns {Promise<Array>}
 */
export async function searchTranscripts(searchQuery, options = {}) {
  const { limit = 50 } = options;

  const sql = `
    SELECT
      tl.id,
      tl.text,
      tl.start_time,
      tl.end_time,
      s.name as speaker_name,
      m.id as meeting_id,
      m.title as meeting_title,
      m.date as meeting_date,
      c.id as chunk_id,
      c.title as chunk_title,
      ts_rank(to_tsvector('english', tl.text), plainto_tsquery('english', $1)) as rank
    FROM transcript_lines tl
    JOIN meetings m ON tl.meeting_id = m.id
    LEFT JOIN speakers s ON tl.speaker_id = s.id
    LEFT JOIN chunks c ON tl.chunk_id = c.id
    WHERE to_tsvector('english', tl.text) @@ plainto_tsquery('english', $1)
    ORDER BY rank DESC, m.date DESC
    LIMIT $2
  `;

  const result = await query(sql, [searchQuery, limit]);
  return result.rows;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Meetings
  listMeetings,
  getMeeting,
  getMeetingWithChunks,
  upsertMeeting,
  updateMeetingStatus,

  // Speakers
  listSpeakers,
  getSpeaker,
  upsertSpeaker,

  // Chunks
  getChunks,
  getChunkWithTranscript,
  insertChunks,

  // Transcript Lines
  getTranscriptLines,
  insertTranscriptLines,
  assignChunksToTranscriptLines,

  // Summaries
  getMeetingSummary,
  upsertMeetingSummary,

  // Search
  searchTranscripts,
};
