# Public API Documentation

Base URL: `http://localhost:3002`

## Endpoints

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "public-api"
}
```

---

## Meetings

### List Meetings

```
GET /api/meetings
```

**Query Parameters:**
- `limit` (number, default: 20) - Number of results
- `offset` (number, default: 0) - Pagination offset
- `state` (string, optional) - Filter by processing state (e.g., "chunked", "diarized")
- `from_date` (string, optional) - Filter meetings on or after date (YYYY-MM-DD)
- `to_date` (string, optional) - Filter meetings on or before date (YYYY-MM-DD)

**Example:**
```bash
curl "http://localhost:3002/api/meetings?limit=5"
```

**Response:**
```json
{
  "data": [
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5",
      "title": "General Policy Committee",
      "meeting_type": "General Policy Committee",
      "date": "2025-11-13T05:00:00.000Z",
      "escribe_url": "https://...",
      "youtube_url": "https://youtube.com/...",
      "processing_status": "chunked",
      "created_at": "2025-11-24T18:57:04.351Z",
      "updated_at": "2025-11-25T01:29:31.528Z"
    }
  ],
  "pagination": {
    "limit": 5,
    "offset": 0,
    "count": 1
  }
}
```

---

### Get Meeting with Chunks

```
GET /api/meetings/:id
```

Returns meeting metadata + array of chunks ordered by sequence.

**Example:**
```bash
curl "http://localhost:3002/api/meetings/0d57b610-0b15-4722-92bb-601620387cf5"
```

**Response:**
```json
{
  "id": "0d57b610-0b15-4722-92bb-601620387cf5",
  "title": "General Policy Committee",
  "date": "2025-11-13T05:00:00.000Z",
  "youtube_url": "https://youtube.com/...",
  "processing_status": "chunked",
  "chunks": [
    {
      "id": "..._chunk_1",
      "sequence_number": 1,
      "start_time": 202.7,
      "end_time": 317.588,
      "title": "Opening Procedures: Call to Order, Agenda, and Minutes Approval",
      "summary": "The mayor opens the General Policy Committee meeting...",
      "chunk_type": "procedural"
    },
    ...
  ]
}
```

---

### Get Meeting Chunks

```
GET /api/meetings/:meetingId/chunks
```

Get all chunks for a meeting.

**Example:**
```bash
curl "http://localhost:3002/api/meetings/0d57b610-0b15-4722-92bb-601620387cf5/chunks"
```

---

### Get Meeting Transcript

```
GET /api/meetings/:meetingId/transcript
```

Get full transcript lines for a meeting.

**Example:**
```bash
curl "http://localhost:3002/api/meetings/0d57b610-0b15-4722-92bb-601620387cf5/transcript"
```

**Response:**
```json
{
  "data": [
    {
      "id": "..._seg_0",
      "start_time": 202.7,
      "end_time": 208.649,
      "text": "Welcome to this General Policy Committee meeting...",
      "whisperx_speaker_label": "SPEAKER_10",
      "chunk_id": "..._chunk_1"
    },
    ...
  ],
  "count": 1092
}
```

---

### Get Meeting Summary

```
GET /api/meetings/:id/summary
```

Get meeting-level summary (if generated).

---

## Chunks

### Get Chunk with Transcript

```
GET /api/chunks/:id
```

Returns chunk metadata + array of transcript lines with speaker labels.

**Example:**
```bash
curl "http://localhost:3002/api/chunks/0d57b610-0b15-4722-92bb-601620387cf5_chunk_1"
```

**Response:**
```json
{
  "id": "..._chunk_1",
  "meeting_id": "0d57b610-0b15-4722-92bb-601620387cf5",
  "sequence_number": 1,
  "start_time": 202.7,
  "end_time": 317.588,
  "title": "Opening Procedures",
  "summary": "...",
  "chunk_type": "procedural",
  "transcript_lines": [
    {
      "id": "..._seg_0",
      "start_time": 202.7,
      "end_time": 208.649,
      "text": "Welcome to this General Policy Committee meeting...",
      "speaker": {
        "id": null,
        "name": null,
        "role": null,
        "title": null
      },
      "whisperx_speaker_label": "SPEAKER_10",
      "voiceprint_confidence": null,
      "was_corrected_by_llm": false
    },
    ...
  ]
}
```

---

## Speakers

### List Speakers

```
GET /api/speakers
```

**Query Parameters:**
- `active_only` (boolean) - Filter to active speakers only

**Example:**
```bash
curl "http://localhost:3002/api/speakers?active_only=true"
```

---

### Get Speaker

```
GET /api/speakers/:id
```

Get a single speaker by ID.

---

## Search

### Search Transcripts

```
GET /api/search
```

Full-text search across all transcripts.

**Query Parameters:**
- `q` (string, required) - Search query
- `meeting_id` (string, optional) - Limit to specific meeting
- `limit` (number, default: 50) - Max results

**Example:**
```bash
curl "http://localhost:3002/api/search?q=budget&limit=10"
```

**Response:**
```json
{
  "query": "budget",
  "data": [
    {
      "id": "..._seg_152",
      "meeting_id": "0d57b610-0b15-4722-92bb-601620387cf5",
      "chunk_id": "..._chunk_5",
      "start_time": 848.04,
      "end_time": 853.789,
      "text": "So we were faced with a $5.9 million estimate for the fiscal 25 budget...",
      "whisperx_speaker_label": "SPEAKER_03"
    },
    ...
  ],
  "count": 10
}
```

---

## Running the API

**Development:**
```bash
npm run api:public
```

**Production:**
```bash
PORT=3002 node api/public-api.js
```

---

## CORS

The API has CORS enabled for all origins in development. Update the `cors()` configuration for production.

---

## Error Responses

All endpoints return standard error responses:

**404 Not Found:**
```json
{
  "error": "Meeting not found"
}
```

**400 Bad Request:**
```json
{
  "error": "Query parameter 'q' is required"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Error message here"
}
```
