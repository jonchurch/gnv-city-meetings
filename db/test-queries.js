#!/usr/bin/env node
/**
 * Test script for database queries
 * Run with: node db/test-queries.js
 */

import * as queries from './queries.js';
import { close } from './client.js';

async function runTests() {
  console.log('🧪 Testing database query layer...\n');

  try {
    // Test 1: List speakers
    console.log('1️⃣  Testing listSpeakers()...');
    const speakers = await queries.listSpeakers({ activeOnly: true });
    console.log(`   ✅ Found ${speakers.length} active speakers`);
    console.log(`   Sample: ${speakers[0].name} (${speakers[0].role})\n`);

    // Test 2: Insert a test meeting
    console.log('2️⃣  Testing upsertMeeting()...');
    const testMeeting = {
      id: 'test_meeting_001',
      title: 'Test City Commission Meeting',
      meeting_type: 'City Commission',
      date: '2025-01-15',
      duration_seconds: 5400,
      escribe_url: 'https://example.com/meeting',
      processing_status: 'discovered',
    };
    const meeting = await queries.upsertMeeting(testMeeting);
    console.log(`   ✅ Created meeting: ${meeting.title}`);
    console.log(`   ID: ${meeting.id}, Status: ${meeting.processing_status}\n`);

    // Test 3: List meetings
    console.log('3️⃣  Testing listMeetings()...');
    const meetings = await queries.listMeetings({ limit: 5 });
    console.log(`   ✅ Found ${meetings.length} meetings\n`);

    // Test 4: Get meeting by ID
    console.log('4️⃣  Testing getMeeting()...');
    const retrieved = await queries.getMeeting(testMeeting.id);
    console.log(`   ✅ Retrieved: ${retrieved.title}\n`);

    // Test 5: Update meeting status
    console.log('5️⃣  Testing updateMeetingStatus()...');
    const updated = await queries.updateMeetingStatus(
      testMeeting.id,
      'downloaded',
      { processing_version: 'test_v1' }
    );
    console.log(`   ✅ Updated status: ${updated.processing_status}\n`);

    // Test 6: Insert transcript lines
    console.log('6️⃣  Testing insertTranscriptLines()...');
    const transcriptLines = [
      {
        id: 'line_001',
        start_time: 0.0,
        end_time: 5.0,
        text: 'Good evening, everyone. Welcome to the City Commission meeting.',
        whisperx_speaker_label: 'SPEAKER_00',
        speaker_id: 'harvey_ward',
      },
      {
        id: 'line_002',
        start_time: 5.5,
        end_time: 10.0,
        text: 'Thank you, Mayor. I would like to call the meeting to order.',
        whisperx_speaker_label: 'SPEAKER_01',
        speaker_id: 'david_arreola',
      },
    ];
    const lineCount = await queries.insertTranscriptLines(
      testMeeting.id,
      transcriptLines,
      'test_v1'
    );
    console.log(`   ✅ Inserted ${lineCount} transcript lines\n`);

    // Test 7: Get transcript lines
    console.log('7️⃣  Testing getTranscriptLines()...');
    const lines = await queries.getTranscriptLines(testMeeting.id);
    console.log(`   ✅ Retrieved ${lines.length} transcript lines`);
    console.log(`   Sample: "${lines[0].text.substring(0, 50)}..."\n`);

    // Test 8: Insert chunks
    console.log('8️⃣  Testing insertChunks()...');
    const chunks = [
      {
        id: 'chunk_001',
        sequence_number: 1,
        start_time: 0.0,
        end_time: 120.0,
        title: 'Call to Order',
        summary: 'Mayor Ward opens the meeting and calls it to order.',
        chunk_type: 'procedural',
      },
      {
        id: 'chunk_002',
        sequence_number: 2,
        start_time: 120.0,
        end_time: 300.0,
        title: 'Agenda Approval',
        summary: 'Commission approves the meeting agenda.',
        chunk_type: 'procedural',
      },
    ];
    const insertedChunks = await queries.insertChunks(
      testMeeting.id,
      chunks,
      'test_v1'
    );
    console.log(`   ✅ Inserted ${insertedChunks.length} chunks\n`);

    // Test 9: Assign chunks to transcript lines
    console.log('9️⃣  Testing assignChunksToTranscriptLines()...');
    const chunkRanges = [
      { chunkId: 'chunk_001', startTime: 0.0, endTime: 120.0 },
      { chunkId: 'chunk_002', startTime: 120.0, endTime: 300.0 },
    ];
    const assignedCount = await queries.assignChunksToTranscriptLines(
      testMeeting.id,
      chunkRanges
    );
    console.log(`   ✅ Assigned ${assignedCount} transcript lines to chunks\n`);

    // Test 10: Get chunk with transcript
    console.log('🔟 Testing getChunkWithTranscript()...');
    const chunk = await queries.getChunkWithTranscript('chunk_001');
    console.log(`   ✅ Retrieved chunk: "${chunk.title}"`);
    console.log(`   Transcript lines: ${chunk.transcript_lines.length}\n`);

    // Test 11: Insert meeting summary
    console.log('1️⃣1️⃣  Testing upsertMeetingSummary()...');
    const summary = await queries.upsertMeetingSummary(testMeeting.id, {
      summary: 'This is a test meeting summary. The commission discussed various agenda items and approved several motions.',
      key_decisions: [
        { decision: 'Approved agenda', vote: '5-0' },
      ],
      key_topics: ['agenda approval', 'procedural'],
      attendees: ['harvey_ward', 'david_arreola'],
      processing_version: 'test_v1',
    });
    console.log(`   ✅ Created meeting summary\n`);

    // Test 12: Get meeting with chunks
    console.log('1️⃣2️⃣  Testing getMeetingWithChunks()...');
    const fullMeeting = await queries.getMeetingWithChunks(testMeeting.id);
    console.log(`   ✅ Retrieved meeting with ${fullMeeting.chunks.length} chunks`);
    console.log(`   Summary: "${fullMeeting.meeting_summary.substring(0, 50)}..."\n`);

    // Test 13: Search transcripts
    console.log('1️⃣3️⃣  Testing searchTranscripts()...');
    const searchResults = await queries.searchTranscripts('meeting', { limit: 10 });
    console.log(`   ✅ Found ${searchResults.length} search results\n`);

    // Cleanup: Delete test data
    console.log('🧹 Cleaning up test data...');
    await queries.updateMeetingStatus(testMeeting.id, 'deleted');
    // In production, you'd actually delete the meeting, but for testing we just mark it
    console.log('   ✅ Cleanup complete\n');

    console.log('✅ All tests passed!\n');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await close();
  }
}

// Run tests
runTests();
