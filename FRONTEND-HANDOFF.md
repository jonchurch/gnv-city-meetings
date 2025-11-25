# Frontend Development Handoff

## Current Repository State

**Backend Infrastructure:**
- **`api/public-api.js`** - Public REST API (Express v5, port 3002) for web app consumption
  - Endpoints: meetings list/detail, chunks, transcripts, search, speakers
  - Documentation: `api/API.md`
- **`api/meetings-api.js`** - Workflow API (port 3001) for pipeline state management
- **`db/`** - PostgreSQL database layer
  - `schema.sql` - Full database schema
  - `queries.js` - Helper functions for all queries
  - `client.js` - Database connection setup

**Processing Pipeline:**
- **`workflow/`** - Orchestration layer
  - `orchestrator.js` - State machine for processing meetings
  - `config.js` - Workflow configuration
- **`workers/`** - Individual processing steps (transcription, diarization, chunking, etc.)
- **`queue/`** - Queue management for processing jobs
- **`discover.js`** - CLI tool to discover new meetings from eScribe
- **`unified-processor.js`** - Single-command processor for a meeting

**Frontend Prep:**
- **`generate-meeting-pages.js`** - Markdown page generator that mocks UI layout
  - Outputs to `.tmp.local/pages/{meeting-id}/`
  - Creates: `meeting.md` (index) + `chunk-{n}.md` (individual pages)
  - Uses public API (not direct DB access)

**Data Storage:**
- **`downloads/`** - Raw files from processing
  - `raw/` - Original audio/video
  - `transcripts/` - WhisperX JSON outputs
  - `derived/` - Processed data files
  - `metadata/` - Meeting metadata from eScribe
- **PostgreSQL database** - Structured data (meetings, chunks, transcript lines, speakers)

**Current Data:**
- One fully processed meeting: `0d57b610-0b15-4722-92bb-601620387cf5`
  - General Policy Committee meeting from 2025-11-13
  - 18 chunks with summaries, titles, and types
  - Full diarized transcript with speaker labels
  - YouTube video: https://www.youtube.com/watch?v=BeLaq4JEvm8

---

## Frontend Planning Notes

**API is Ready:**
- Base URL: `http://localhost:3002`
- Full REST API with filtering, pagination, search
- All data accessible via API (no direct DB access needed)

**Page Layout Established (from markdown mockups):**
- Meeting index: chapters list with timestamps, durations, summaries
- Chunk pages:
  - Navigation breadcrumbs (top & bottom)
  - Title, time (`19:49 ⏱️ 3m 33s`), meeting name, type
  - YouTube embed (autoplay, muted, captions, starts at timestamp)
  - Summary section
  - Transcript with `>>**SPEAKER** [timestamp]` format, line breaks per segment

**Technology Stack Already in Use:**
- Node.js (ES modules)
- Express v5
- PostgreSQL
- Fetch API for HTTP requests

---

## Frontend Implementation Plan

**Decision: Next.js with Static Export**

Rationale:
- Static HTML generation for SEO (local gov meeting content should be indexable)
- React ecosystem for interactive features (transcript sync with video)
- Familiar tooling, shadcn/ui component library support
- `output: 'export'` gives static files, keeps Express API as data layer

### 1. Project Setup (`web/` directory)

```bash
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir
```

Configuration:
- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS
- Static export mode (`output: 'export'` in next.config.js)
- shadcn/ui for component primitives

### 2. Route Structure

```
web/src/app/
├── layout.tsx              # Root layout (header, nav)
├── page.tsx                # / → Meetings list
├── meetings/
│   └── [id]/
│       ├── page.tsx        # /meetings/[id] → Meeting detail
│       └── chunks/
│           └── [seq]/
│               └── page.tsx # /meetings/[id]/chunks/[seq] → Chunk page
└── search/
    └── page.tsx            # /search?q=... → Search results
```

### 3. API Client Layer

```
web/src/lib/
├── api.ts                  # Fetch wrapper for localhost:3002
└── types.ts                # Meeting, Chunk, TranscriptLine types
```

### 4. Page Specifications

**Meetings List (`/`)**
- Fetch `GET /api/meetings`
- Display as cards: title, date, meeting type, processing status
- Link to meeting detail page

**Meeting Detail (`/meetings/[id]`)**
- Fetch `GET /api/meetings/:id`
- Layout matches `meeting.md`:
  - Title, date, status
  - YouTube thumbnail/link to full video
  - Chapters list (18 items for test meeting)
    - Each: sequence number, title, timestamp, duration, type badge, summary excerpt
    - Link to chunk page

**Chunk Page (`/meetings/[id]/chunks/[seq]`)**
- Fetch `GET /api/chunks/:id` (construct ID from meeting ID + sequence)
- Layout matches `chunk-N.md`:
  - Navigation: ← Back to Meeting | ← Previous | Next →
  - Title (h1)
  - Meta line: timestamp, duration, meeting name, type badge
  - YouTube embed (iframe with `?start={seconds}`)
  - Summary section
  - Transcript section:
    - Each line: speaker label, timestamp, text
    - Visual grouping by speaker

**Search Results (`/search`)**
- Fetch `GET /api/search?q=...`
- Display matching transcript lines with context
- Link to chunk page at specific timestamp

### 5. Components

```
web/src/components/
├── Header.tsx              # Site header with nav
├── MeetingCard.tsx         # Card for meetings list
├── ChapterList.tsx         # Chapters/chunks list on meeting page
├── ChapterCard.tsx         # Individual chapter in list
├── YouTubeEmbed.tsx        # iframe wrapper with timestamp support
├── Transcript.tsx          # Transcript display
├── TranscriptLine.tsx      # Individual transcript segment
├── ChunkNavigation.tsx     # Prev/Next navigation
└── TypeBadge.tsx           # procedural, presentation, discussion, etc.
```

### 6. Static Generation

For static export, use `generateStaticParams` to pre-render all known routes:

```typescript
// web/src/app/meetings/[id]/page.tsx
export async function generateStaticParams() {
  const meetings = await fetchMeetings()
  return meetings.map((m) => ({ id: m.id }))
}

// web/src/app/meetings/[id]/chunks/[seq]/page.tsx
export async function generateStaticParams() {
  const meetings = await fetchMeetings()
  const params = []
  for (const meeting of meetings) {
    const detail = await fetchMeeting(meeting.id)
    for (const chunk of detail.chunks) {
      params.push({ id: meeting.id, seq: String(chunk.sequence_number) })
    }
  }
  return params
}
```

### 7. Future Interactive Features

Once static pages are working, add client-side interactivity:

- **YouTube Player API**: Replace basic iframe with `@iframe-resizer/react` or YouTube IFrame API
- **Transcript sync**: Highlight current transcript line based on video playback time
- **Click-to-seek**: Click transcript line → video jumps to that timestamp
- **Search highlighting**: Highlight search terms in transcript

### 8. Development Workflow

```bash
# Terminal 1: Run the Express API
npm run api:public

# Terminal 2: Run Next.js dev server
cd web && npm run dev

# Build static export
cd web && npm run build
# Output in web/out/
```

### 9. Styling Notes

- Tailwind for utility classes
- shadcn/ui components as needed (Button, Card, Badge, etc.)
- Dark mode support (optional, but Tailwind makes it easy)
- Mobile-first responsive design
- Typography: readable transcript text, clear hierarchy
