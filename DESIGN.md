# Design Goals

## What We're Building

A way for Gainesville residents to engage with city government meetings without watching hours of video. The content should be searchable, skimmable, and accessible.

## Core Principles

### Transcript-First
The transcript is the primary interface, not a supplement to video. Users should be able to read and understand meeting content without ever pressing play. Video exists to provide context, verify quotes, or see body language when needed.

### Respect User Attention
City meetings are long and dense. The interface should help users find what they care about quickly and stay oriented when they dive in. Don't overwhelm with a wall of text; reveal content progressively and make navigation obvious.

### Meeting Structure is Navigation
Meetings have natural structure: agenda items, discussions, public comments, votes. This structure should be surfaced as navigation, letting users jump to topics rather than scrub through timelines.

### Keep Video and Transcript in Sync
When a user is watching, the transcript should follow along. When a user clicks a transcript line, the video should jump there. The two should feel like one unified experience, not separate components.

### Searchable Public Record
All content should be indexable and searchable. Someone googling a topic discussed in a city meeting should be able to land on the relevant section directly.

## User Goals

**"What did they decide about X?"**
Find the relevant discussion quickly, skim the summary, read the transcript if needed, watch the video for full context.

**"What happened at the meeting?"**
Browse the chapter list, read summaries, get a sense of what was covered without watching the whole thing.

**"I want to watch but skip the boring parts"**
Navigate by agenda items, skip procedural chunks, jump to discussions and public comments.

**"I heard about something and want to see exactly what was said"**
Search transcripts, land on the exact moment, see it in context.

## Pages

### Home / Meetings List
- List of available meetings
- Each shows: title, date, meeting type
- Link to meeting detail page

### Meeting Page
- Meeting title, date, type
- Meeting-level summary (if available)
- YouTube thumbnail linking to full video
- List of chunks/chapters as navigation
  - Each chunk: title, timestamp, duration, type (procedural/presentation/discussion/public comment), summary excerpt
  - Clicking a chunk goes to the chunk page

### Chunk Page
- Chunk title, timestamp, duration, type
- Parent meeting info for context
- Navigation to previous/next chunks
- YouTube video embed, starting at chunk timestamp
- Chunk summary
- Full transcript with speaker labels and timestamps
- Transcript and video stay in sync:
  - Current line highlighted as video plays
  - Clicking a transcript line seeks video to that moment

### Search Results
- Search across all transcripts
- Results show matching text with context
- Link to specific chunk/timestamp

## Example Data

### Meetings List Response
`GET /api/meetings`

```json
{
  "data": [
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5",
      "title": "General Policy Committee",
      "meeting_type": "General Policy Committee",
      "date": "2025-11-13T05:00:00.000Z",
      "youtube_url": "https://www.youtube.com/watch?v=BeLaq4JEvm8",
      "processing_status": "chunked"
    },
    {
      "id": "3b1a7177-92c8-460c-8080-247dfff560ed",
      "title": "City Commission - Regular Meeting",
      "meeting_type": "City Commission - Regular",
      "date": "2025-11-20T05:00:00.000Z",
      "youtube_url": "https://www.youtube.com/watch?v=...",
      "processing_status": "diarized"
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "count": 2 }
}
```

### Meeting Detail Response
`GET /api/meetings/0d57b610-0b15-4722-92bb-601620387cf5`

```json
{
  "id": "0d57b610-0b15-4722-92bb-601620387cf5",
  "title": "General Policy Committee",
  "meeting_type": "General Policy Committee",
  "date": "2025-11-13T05:00:00.000Z",
  "youtube_url": "https://www.youtube.com/watch?v=BeLaq4JEvm8",
  "processing_status": "chunked",
  "chunks": [
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5_chunk_1",
      "sequence_number": 1,
      "start_time": 202.7,
      "end_time": 317.588,
      "title": "Opening Procedures: Call to Order, Agenda, and Minutes Approval",
      "summary": "The mayor opens the General Policy Committee meeting, notes the agenda, and turns to the clerk for procedural items. The commission adopts the agenda by motion and voice vote, with one commissioner absent. The clerk then presents updated minutes from the October 23, 2025 meeting, explaining a correction to an inadvertent provision. Commissioner Willits moves approval, thanks the clerk and the citizen who caught the error, and reflects on the complexity of the prior item. The minutes are then approved unanimously.",
      "chunk_type": "procedural"
    },
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5_chunk_2",
      "sequence_number": 2,
      "start_time": 318.631,
      "end_time": 518.133,
      "title": "Introduction of IT SLA Update Agenda Item and New Technology Team",
      "summary": "The clerk introduces agenda item 2025-898 regarding the IT Service Level Agreement (SLA) update with Gainesville Regional Utilities (GRU). The mayor welcomes Technology Director Ed Nagy for his first full presentation. Before discussing the SLA, Nagy introduces leaders of the newly organized city technology team...",
      "chunk_type": "presentation"
    },
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5_chunk_7",
      "sequence_number": 7,
      "start_time": 1189.308,
      "end_time": 1403.174,
      "title": "Introduction to Imagine GNV Comprehensive Plan Update and Process Expectations",
      "summary": "The clerk introduces agenda item 2025-910, the Imagine GNV Comprehensive Plan update, with a recommendation for discussion and guidance on next steps. The mayor addresses concerns about whether this will be the only review of the draft plan, explaining he envisions multiple opportunities...",
      "chunk_type": "presentation"
    }
  ]
}
```

### Chunk Detail Response
`GET /api/chunks/0d57b610-0b15-4722-92bb-601620387cf5_chunk_7`

```json
{
  "id": "0d57b610-0b15-4722-92bb-601620387cf5_chunk_7",
  "meeting_id": "0d57b610-0b15-4722-92bb-601620387cf5",
  "sequence_number": 7,
  "start_time": 1189.308,
  "end_time": 1403.174,
  "title": "Introduction to Imagine GNV Comprehensive Plan Update and Process Expectations",
  "summary": "The clerk introduces agenda item 2025-910, the Imagine GNV Comprehensive Plan update, with a recommendation for discussion and guidance on next steps. The mayor addresses concerns about whether this will be the only review of the draft plan, explaining he envisions multiple opportunities: an overview discussion today, followed by commissioners and community members compiling questions and meeting with staff over the next month and a half, and then a follow-up discussion in January. He emphasizes wanting thorough but not endless meetings.\n\nThe city manager reflects on working on the plan for roughly five years, thanks staff and the commission, and says the draft is in good shape though still evolving. He notes staff will continue refining the document before state transmittal and is available to meet with commissioners and the public about details. He frames future changes as largely additive to an already solid base before introducing planner Forrest Edelton to present.",
  "chunk_type": "presentation",
  "transcript_lines": [
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5_seg_220",
      "start_time": 1189.308,
      "end_time": 1194.159,
      "text": "You don't want to stay for the comp plan?",
      "whisperx_speaker_label": "SPEAKER_10"
    },
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5_seg_221",
      "start_time": 1194.179,
      "end_time": 1194.7,
      "text": "Madam Clerk.",
      "whisperx_speaker_label": "SPEAKER_10"
    },
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5_seg_222",
      "start_time": 1195.962,
      "end_time": 1201.251,
      "text": "Mr. Mayor, we're on to 2025-910 Imagine GNV Comprehensive Plan update.",
      "whisperx_speaker_label": "SPEAKER_11"
    },
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5_seg_223",
      "start_time": 1201.291,
      "end_time": 1211.71,
      "text": "With the recommendation that the General Policy Committee discuss the update of the Comprehensive Plan, Imagine GNV, and if necessary, provide guidance to staff on next steps to complete the Comprehensive Plan.",
      "whisperx_speaker_label": "SPEAKER_11"
    },
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5_seg_224",
      "start_time": 1211.69,
      "end_time": 1231.217,
      "text": "very good thank you so before we roll into this um i'll pass over the city manager and he'll introduce mr edelton but um i i know that there have been questions about you know is this the only time that we're going to look at the uh at this draft of the comprehensive plan and the answer is might be the only time we look at this draft",
      "whisperx_speaker_label": "SPEAKER_10"
    },
    {
      "id": "0d57b610-0b15-4722-92bb-601620387cf5_seg_225",
      "start_time": 1231.197,
      "end_time": 1235.305,
      "text": "but I imagine there will be other opportunities to look at another draft or so.",
      "whisperx_speaker_label": "SPEAKER_10"
    }
  ]
}
```
