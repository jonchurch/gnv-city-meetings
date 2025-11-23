#!/usr/bin/env node
/**
 * Generate realistic test data for development
 * Creates complete meetings with transcripts, chunks, and summaries
 *
 * Run with: node scripts/generate-test-data.js
 */

import * as db from '../db/queries.js';
import { close } from '../db/client.js';

// Sample transcript data (realistic City Commission meeting)
const SAMPLE_TRANSCRIPT = [
  { speaker: 'harvey_ward', text: 'Good evening, everyone. Welcome to the January 15th City Commission meeting. I\'d like to call this meeting to order.' },
  { speaker: 'harvey_ward', text: 'First order of business is approval of the agenda. Do I have a motion to approve the agenda as written?' },
  { speaker: 'david_arreola', text: 'So moved.' },
  { speaker: 'reina_saco', text: 'Second.' },
  { speaker: 'harvey_ward', text: 'All those in favor say aye.' },
  { speaker: 'harvey_ward', text: 'Any opposed? Hearing none, the agenda is approved.' },
  { speaker: 'harvey_ward', text: 'Next we have approval of the minutes from our last meeting on December 18th.' },
  { speaker: 'bryan_eastman', text: 'Motion to approve the minutes as written.' },
  { speaker: 'cynthia_moore_chestnut', text: 'Second.' },
  { speaker: 'harvey_ward', text: 'All in favor? Any opposed? Minutes are approved.' },
  { speaker: 'harvey_ward', text: 'Now we move to public comment. Is there anyone here who would like to address the commission on any matter not on tonight\'s agenda?' },
  { speaker: 'unknown_speaker', text: 'Yes, I\'d like to speak about the proposed housing development on Northwest 39th Avenue.' },
  { speaker: 'harvey_ward', text: 'Please come to the podium and state your name for the record.' },
  { speaker: 'unknown_speaker', text: 'My name is Sarah Johnson. I\'m a resident of the neighborhood, and I have concerns about the increased traffic this development will bring.' },
  { speaker: 'unknown_speaker', text: 'Our streets are already congested during rush hour, and adding 200 units will make it significantly worse.' },
  { speaker: 'harvey_ward', text: 'Thank you, Ms. Johnson. We appreciate your input. Are there any other speakers?' },
  { speaker: 'harvey_ward', text: 'Hearing none, we\'ll close public comment and move to our regular agenda items.' },
  { speaker: 'harvey_ward', text: 'Item 7A is a resolution approving the fiscal year 2025 budget amendment. Mr. Arreola, would you like to present this?' },
  { speaker: 'david_arreola', text: 'Thank you, Mayor. This budget amendment allocates an additional $2.3 million for infrastructure improvements in the downtown area.' },
  { speaker: 'david_arreola', text: 'Specifically, this will fund sidewalk repairs, street resurfacing, and new LED streetlights along University Avenue.' },
  { speaker: 'reina_saco', text: 'I have a question about the timeline for these improvements. When would the work begin?' },
  { speaker: 'david_arreola', text: 'According to the city manager, we expect to begin in March and complete the work by September, before the fall semester starts.' },
  { speaker: 'bryan_eastman', text: 'I\'d also like to note that this project will create approximately 50 local jobs during the construction period.' },
  { speaker: 'harvey_ward', text: 'Thank you. Any other discussion? Hearing none, do I have a motion?' },
  { speaker: 'david_arreola', text: 'I move to approve the budget amendment as presented.' },
  { speaker: 'desmon_duncan_walker', text: 'Second.' },
  { speaker: 'harvey_ward', text: 'All in favor say aye. Any opposed? The motion carries unanimously.' },
  { speaker: 'harvey_ward', text: 'Our next item is 7B, a land use change for the property at 2300 Southwest 13th Street.' },
  { speaker: 'harvey_ward', text: 'Staff, could you provide an overview?' },
  { speaker: 'forest_edelton', text: 'Certainly, Mayor. This is a request to change the land use from single-family residential to mixed-use commercial.' },
  { speaker: 'forest_edelton', text: 'The applicant is proposing a three-story mixed-use building with retail on the ground floor and residential units above.' },
  { speaker: 'cynthia_moore_chestnut', text: 'What was the feedback from the neighborhood meeting?' },
  { speaker: 'forest_edelton', text: 'The neighborhood meeting had about 15 attendees. Concerns were raised about parking and building height.' },
  { speaker: 'forest_edelton', text: 'However, the applicant has agreed to provide additional parking and step back the third floor to reduce visual impact.' },
  { speaker: 'reina_saco', text: 'I think this is a good example of infill development. We need more housing options near commercial corridors.' },
  { speaker: 'bryan_eastman', text: 'I agree. The modifications address the neighborhood concerns adequately.' },
  { speaker: 'harvey_ward', text: 'Do I have a motion?' },
  { speaker: 'reina_saco', text: 'I move to approve the land use change with the conditions discussed.' },
  { speaker: 'bryan_eastman', text: 'Second.' },
  { speaker: 'harvey_ward', text: 'All in favor? Any opposed? Motion carries 5-0.' },
  { speaker: 'harvey_ward', text: 'Is there any other business to come before the commission this evening?' },
  { speaker: 'david_arreola', text: 'Just a reminder that our next meeting is February 5th at 6:30 PM.' },
  { speaker: 'harvey_ward', text: 'Thank you. Hearing no other business, this meeting is adjourned.' },
];

// Chunk definitions (semantic segments of the meeting)
const CHUNKS = [
  {
    sequence_number: 1,
    title: 'Call to Order and Agenda Approval',
    summary: 'Mayor Ward calls the meeting to order. The commission unanimously approves the agenda as written.',
    chunk_type: 'procedural',
    start_index: 0,
    end_index: 5,
  },
  {
    sequence_number: 2,
    title: 'Approval of Minutes',
    summary: 'The commission reviews and approves the minutes from the December 18th meeting.',
    chunk_type: 'procedural',
    start_index: 6,
    end_index: 9,
  },
  {
    sequence_number: 3,
    title: 'Public Comment Period',
    summary: 'Sarah Johnson addresses the commission regarding concerns about traffic impacts from a proposed housing development on Northwest 39th Avenue.',
    chunk_type: 'public_comment',
    start_index: 10,
    end_index: 16,
  },
  {
    sequence_number: 4,
    title: 'Budget Amendment - Infrastructure Improvements',
    summary: 'Commissioner Arreola presents a $2.3 million budget amendment for downtown infrastructure improvements including sidewalks, street resurfacing, and LED streetlights. The motion passes unanimously 5-0.',
    chunk_type: 'agenda_item',
    agenda_item_number: '7.A',
    start_index: 17,
    end_index: 26,
  },
  {
    sequence_number: 5,
    title: 'Land Use Change - 2300 SW 13th Street',
    summary: 'Staff presents a land use change request from single-family to mixed-use commercial for a three-story development with retail and residential. After discussion of neighborhood concerns and applicant modifications, the commission approves 5-0.',
    chunk_type: 'agenda_item',
    agenda_item_number: '7.B',
    start_index: 27,
    end_index: 38,
  },
  {
    sequence_number: 6,
    title: 'Adjournment',
    summary: 'Commissioner Arreola reminds everyone of the next meeting date. Mayor Ward adjourns the meeting.',
    chunk_type: 'procedural',
    start_index: 39,
    end_index: 41,
  },
];

/**
 * Generate transcript lines from sample data
 */
function generateTranscriptLines(meetingId) {
  let currentTime = 0;
  const lines = [];

  for (let i = 0; i < SAMPLE_TRANSCRIPT.length; i++) {
    const item = SAMPLE_TRANSCRIPT[i];
    const duration = 3 + Math.random() * 4; // 3-7 seconds per line

    lines.push({
      id: `${meetingId}_line_${String(i + 1).padStart(3, '0')}`,
      start_time: currentTime,
      end_time: currentTime + duration,
      text: item.text,
      speaker_id: item.speaker,
      whisperx_speaker_label: `SPEAKER_${String(i % 5).padStart(2, '0')}`, // Simulates WhisperX labels
      voiceprint_confidence: 0.85 + Math.random() * 0.15, // 0.85-1.0
      was_corrected_by_llm: false,
    });

    currentTime += duration + 0.5; // Add small gap between utterances
  }

  return lines;
}

/**
 * Generate chunks with proper time ranges
 */
function generateChunks(meetingId, transcriptLines) {
  const chunks = [];

  for (const chunkDef of CHUNKS) {
    const startLine = transcriptLines[chunkDef.start_index];
    const endLine = transcriptLines[chunkDef.end_index];

    chunks.push({
      id: `${meetingId}_chunk_${String(chunkDef.sequence_number).padStart(2, '0')}`,
      sequence_number: chunkDef.sequence_number,
      start_time: startLine.start_time,
      end_time: endLine.end_time,
      title: chunkDef.title,
      summary: chunkDef.summary,
      chunk_type: chunkDef.chunk_type,
      agenda_item_number: chunkDef.agenda_item_number || null,
    });
  }

  return chunks;
}

/**
 * Main function - generates complete test meeting
 */
async function generateTestData() {
  console.log('🎭 Generating realistic test data...\n');

  try {
    // Create a City Commission meeting
    const meetingId = 'cc_2025_01_15';

    console.log('1️⃣  Creating meeting...');
    const meeting = await db.upsertMeeting({
      id: meetingId,
      title: 'City Commission Meeting - January 15, 2025',
      meeting_type: 'City Commission',
      date: '2025-01-15',
      duration_seconds: 3600, // 1 hour
      escribe_url: 'https://gainesville.legistar.com/MeetingDetail.aspx?ID=123456',
      youtube_url: 'https://www.youtube.com/watch?v=example123',
      video_path: 's3://meetings/raw/cc_2025_01_15/video.mp4',
      audio_path: 's3://meetings/raw/cc_2025_01_15/audio.wav',
      processing_status: 'chunked',
      processing_version: 'test_v1',
      processed_at: new Date().toISOString(),
    });
    console.log(`   ✅ Created: ${meeting.title}`);
    console.log(`   ID: ${meeting.id}\n`);

    // Generate transcript lines
    console.log('2️⃣  Generating transcript lines...');
    const transcriptLines = generateTranscriptLines(meetingId);
    await db.insertTranscriptLines(meetingId, transcriptLines, 'whisperx_v1');
    console.log(`   ✅ Inserted ${transcriptLines.length} transcript lines`);
    console.log(`   Duration: ${transcriptLines[transcriptLines.length - 1].end_time.toFixed(1)}s\n`);

    // Generate chunks
    console.log('3️⃣  Creating semantic chunks...');
    const chunks = generateChunks(meetingId, transcriptLines);
    await db.insertChunks(meetingId, chunks, 'chunker_v1');
    console.log(`   ✅ Created ${chunks.length} chunks:\n`);
    for (const chunk of chunks) {
      console.log(`      ${chunk.sequence_number}. ${chunk.title} (${chunk.chunk_type})`);
    }
    console.log();

    // Assign chunks to transcript lines
    console.log('4️⃣  Assigning chunks to transcript lines...');
    const chunkRanges = chunks.map(c => ({
      chunkId: c.id,
      startTime: c.start_time,
      endTime: c.end_time,
    }));
    const assignedCount = await db.assignChunksToTranscriptLines(meetingId, chunkRanges);
    console.log(`   ✅ Assigned ${assignedCount} lines to chunks\n`);

    // Create meeting summary
    console.log('5️⃣  Creating meeting summary...');
    await db.upsertMeetingSummary(meetingId, {
      summary: 'The City Commission met on January 15, 2025 to conduct regular business. The commission approved the agenda and minutes from the previous meeting. During public comment, a resident raised concerns about traffic impacts from a proposed housing development. The commission then approved a $2.3 million budget amendment for downtown infrastructure improvements, including sidewalk repairs and LED streetlights. Finally, the commission approved a land use change for a mixed-use development at 2300 SW 13th Street after the applicant addressed neighborhood concerns about parking and building height. All motions passed unanimously.',
      key_decisions: [
        { decision: 'Approved FY2025 Budget Amendment for Infrastructure', vote: '5-0', amount: '$2.3M' },
        { decision: 'Approved Land Use Change - 2300 SW 13th St', vote: '5-0', type: 'Single-family to Mixed-use' },
      ],
      key_topics: ['budget', 'infrastructure', 'land use', 'mixed-use development', 'public comment'],
      attendees: ['harvey_ward', 'david_arreola', 'reina_saco', 'bryan_eastman', 'cynthia_moore_chestnut', 'desmon_duncan_walker'],
      processing_version: 'summarizer_v1',
    });
    console.log(`   ✅ Created meeting summary\n`);

    // Verify everything
    console.log('6️⃣  Verifying data...');
    const fullMeeting = await db.getMeetingWithChunks(meetingId);
    console.log(`   ✅ Meeting has ${fullMeeting.chunks.length} chunks`);
    console.log(`   ✅ Summary: ${fullMeeting.meeting_summary.substring(0, 80)}...\n`);

    // Test a chunk with transcript
    const chunk = await db.getChunkWithTranscript(chunks[3].id); // Budget discussion
    console.log(`   ✅ Chunk "${chunk.title}" has ${chunk.transcript_lines.length} transcript lines\n`);

    // Test search
    const searchResults = await db.searchTranscripts('budget', { limit: 5 });
    console.log(`   ✅ Search for "budget" found ${searchResults.length} results\n`);

    console.log('✅ Test data generation complete!\n');
    console.log('📊 Summary:');
    console.log(`   • Meeting ID: ${meetingId}`);
    console.log(`   • Transcript lines: ${transcriptLines.length}`);
    console.log(`   • Chunks: ${chunks.length}`);
    console.log(`   • Duration: ~${Math.floor(transcriptLines[transcriptLines.length - 1].end_time / 60)} minutes`);
    console.log(`   • Speakers: 7 (6 commissioners + public)`);
    console.log('\n💡 Try these queries:');
    console.log('   SELECT * FROM meetings WHERE id = \'cc_2025_01_15\';');
    console.log('   SELECT * FROM chunks WHERE meeting_id = \'cc_2025_01_15\' ORDER BY sequence_number;');
    console.log('   SELECT COUNT(*) FROM transcript_lines WHERE meeting_id = \'cc_2025_01_15\';');
    console.log('\n🔍 Or use the query layer:');
    console.log('   import * as db from \'./db/queries.js\';');
    console.log('   const meeting = await db.getMeetingWithChunks(\'cc_2025_01_15\');');

  } catch (error) {
    console.error('❌ Error generating test data:', error);
    throw error;
  } finally {
    await close();
  }
}

// Run it
generateTestData();
