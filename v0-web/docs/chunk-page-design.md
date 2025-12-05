# Chunk Page Design Document

## Overview

The Chunk Page is a core component of a civic engagement platform that helps Gainesville residents engage with city government meetings without watching hours of video. It displays a single "chunk" (a distinct segment of a meeting) with synchronized video and transcript.

---

## Design Principles

### 1. Transcript-First

The transcript is the primary interface, not a supplement to video. Users should be able to read and understand meeting content without ever pressing play. Video exists to provide context, verify quotes, or see body language when needed.

### 2. Summary as Anchor

The summary answers "should I watch this?" for 80% of users. It surfaces:
- **Key Decisions & Outcomes** - What was actually decided or committed to
- **Notable Quotes** - Human moments that reveal positions or stakes

Users who want more can dive into the full transcript below.

### 3. Respect User Attention

City meetings are long and dense. The interface reveals content progressively:
- Summary first (the answer)
- Full transcript second (the source material)
- Clear section dividers signal "you're diving deeper now"

### 4. Video-Transcript Sync

When video plays, the floating mini-player stays visible during scroll. Clicking any transcript line or quote seeks the video to that moment. The two feel like one unified experience.

---

## Inspiration & Patterns Borrowed

| Source | Pattern Borrowed |
|--------|------------------|
| **Otter.ai, Grain** | Speaker avatars with color coding for scannability |
| **Descript** | Transcript as primary interface, paragraph grouping |
| **Snipd** | Key moment highlights, quote extraction |
| **TED.com** | Clean paragraph-based transcripts, content-forward design |
| **Podcast apps** | Natural page scroll, reading-focused layout |

---

## Component Architecture

\`\`\`
ChunkPage
├── ChunkHeader
│   ├── Breadcrumb (back to meeting)
│   ├── Title + Type Badge
│   ├── Metadata (date, timestamps, duration)
│   ├── Progress indicator (3 of 5)
│   └── Theme toggle
│
├── YouTubePlayer
│   └── Embedded video starting at chunk timestamp
│
├── ChunkSummary
│   ├── Summary paragraph
│   ├── Key Decisions box (green accent)
│   └── Notable Quotes (clickable, seek to timestamp)
│
├── TranscriptViewer
│   ├── Section divider (speaker count, duration)
│   └── TranscriptBlocks
│       ├── Speaker avatar (colored by speaker)
│       ├── Speaker name + timestamp
│       ├── Paragraph text (with inline timestamp pills for long blocks)
│       └── Click-to-seek functionality
│
├── ChunkNavigation
│   └── Previous/Next chunk buttons
│
└── FloatingMiniPlayer (appears on scroll)
    ├── Video thumbnail
    ├── Playing indicator
    ├── Chunk title
    └── Dismiss button
\`\`\`

---

## Key Features Implemented

### Speaker Color Coding
Each speaker gets a consistent color across the transcript. Colors are assigned from a curated palette and stored in a map for consistency within a session.

\`\`\`typescript
const speakerColors = [
  'bg-emerald-500', 'bg-blue-500', 'bg-amber-500',
  'bg-purple-500', 'bg-rose-500', 'bg-cyan-500', ...
]
\`\`\`

### Paragraph Grouping
Consecutive lines from the same speaker are grouped into readable paragraphs rather than individual timestamped lines. This transforms a "log" into readable content.

### Long Block Handling
Speaker blocks longer than 45 seconds are automatically broken into paragraphs with inline timestamp pills every ~40 seconds. This provides clickable waypoints into long monologues.

\`\`\`
SPEAKER_01 · 15:30

First paragraph of content here...

                                    [16:15]

Second paragraph continues here...
\`\`\`

### Floating Mini-Player
When the user scrolls past the main video, a compact floating player appears in the bottom-right corner. It shows:
- Video thumbnail with "Playing" indicator
- Chunk title
- Click to scroll back to main video
- Dismiss button

Uses IntersectionObserver to detect when <30% of the main player is visible.

### Clickable Quotes
Notable quotes in the summary include timestamps. Clicking a quote seeks the video to that moment, creating a direct link between summary insights and source material.

### Dark Mode
System preference detection with manual toggle. Persists choice to localStorage. All components use semantic color tokens that automatically adapt.

---

## Typography & Layout

### Content Width
- Transcript blocks: `max-w-2xl` (~672px) for optimal reading
- Summary text: `max-w-prose` (~65ch) for comfortable line length

### Spacing
- Consistent `space-y-6` between major sections
- `gap-4` within component groups
- Generous padding (`p-6`) on cards

### Visual Hierarchy
1. **Header**: Large title, subtle metadata
2. **Video**: Full-width embed
3. **Summary**: Card with green accent for decisions
4. **Divider**: Centered rule with "FULL TRANSCRIPT" label
5. **Transcript**: Left-aligned conversation flow

---

## Data Model

\`\`\`typescript
interface TranscriptLine {
  speaker: string      // "SPEAKER_01" format
  text: string
  startTime: number    // seconds
  endTime: number      // seconds
}

interface ChunkSummary {
  text: string
  keyDecisions: string[]
  notableQuotes: {
    text: string
    speaker: string
    timestamp: number
  }[]
}

interface Chunk {
  id: string
  title: string
  type: 'procedural' | 'presentation' | 'discussion' | 'public_comment' | 'vote'
  startTime: number
  endTime: number
  summary: ChunkSummary
}
\`\`\`

---

## Summary Prompt Guidelines

To generate summaries that serve as effective anchors (vs. meeting-minutes style), the LLM prompt should:

**Do:**
- Lead with outcomes, not process
- Include specific names, dates, numbers, locations
- Use action verbs: "committed to," "confirmed," "announced"
- Surface quotes that reveal positions or stakes

**Avoid:**
- Vague process language: "discussed," "covered," "addressed"
- Topic lists without outcomes
- Dense single paragraphs

**Structure:**
1. 2-3 sentence narrative summary
2. Key Decisions array (concrete outcomes only)
3. Notable Quotes with timestamps (for linking)

---

## Future Considerations

- [ ] Active transcript highlighting during playback
- [ ] Auto-scroll to keep current line visible
- [ ] Keyboard shortcuts (space = play/pause)
- [ ] Search within transcript
- [ ] Anchor links from summary to specific transcript blocks
- [ ] Mobile-optimized layout
- [ ] Loading skeletons
