#!/usr/bin/env node
/**
 * Test query layer with the generated test data
 */

import * as db from '../db/queries.js';
import { close } from '../db/client.js';

async function testQueries() {
  console.log('🧪 Testing queries with realistic data...\n');

  try {
    // Test 1: Get meeting with chunks
    console.log('1️⃣  Testing getMeetingWithChunks()...');
    const meeting = await db.getMeetingWithChunks('cc_2025_01_15');
    console.log(`   Title: ${meeting.title}`);
    console.log(`   Date: ${meeting.date}`);
    console.log(`   Status: ${meeting.processing_status}`);
    console.log(`   Chunks: ${meeting.chunks.length}`);
    console.log(`   Summary: ${meeting.meeting_summary.substring(0, 100)}...`);
    const topics = typeof meeting.key_topics === 'string' ? JSON.parse(meeting.key_topics) : meeting.key_topics;
    console.log(`   Key topics: ${topics.join(', ')}\n`);

    // Test 2: Get a specific chunk with transcript
    console.log('2️⃣  Testing getChunkWithTranscript()...');
    const budgetChunk = meeting.chunks.find(c => c.title.includes('Budget'));
    const chunkDetail = await db.getChunkWithTranscript(budgetChunk.id);
    console.log(`   Chunk: "${chunkDetail.title}"`);
    console.log(`   Type: ${chunkDetail.chunk_type}`);
    console.log(`   Duration: ${(chunkDetail.end_time - chunkDetail.start_time).toFixed(1)}s`);
    console.log(`   Transcript lines: ${chunkDetail.transcript_lines.length}`);
    console.log(`   Speakers in chunk:`, [...new Set(chunkDetail.transcript_lines.map(l => l.speaker.name))].join(', '));
    console.log(`\n   Sample transcript:`);
    chunkDetail.transcript_lines.slice(0, 3).forEach(line => {
      console.log(`     [${line.start_time.toFixed(1)}s] ${line.speaker.name}: ${line.text}`);
    });
    console.log();

    // Test 3: Search across all transcripts
    console.log('3️⃣  Testing searchTranscripts()...');
    const results = await db.searchTranscripts('infrastructure improvements', { limit: 5 });
    console.log(`   Found ${results.length} results for "infrastructure improvements":`);
    results.forEach((r, i) => {
      console.log(`     ${i + 1}. [${r.speaker_name}] "${r.text.substring(0, 60)}..."`);
      console.log(`        in "${r.chunk_title}" at ${r.start_time.toFixed(1)}s`);
    });
    console.log();

    // Test 4: List transcript lines for entire meeting
    console.log('4️⃣  Testing getTranscriptLines()...');
    const lines = await db.getTranscriptLines('cc_2025_01_15');
    console.log(`   Total lines: ${lines.length}`);
    const speakerCounts = lines.reduce((acc, line) => {
      const speaker = line.speaker_name || 'Unknown';
      acc[speaker] = (acc[speaker] || 0) + 1;
      return acc;
    }, {});
    console.log(`   Speaker distribution:`);
    Object.entries(speakerCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([speaker, count]) => {
        console.log(`     ${speaker}: ${count} lines`);
      });
    console.log();

    // Test 5: Get meeting summary
    console.log('5️⃣  Testing getMeetingSummary()...');
    const summary = await db.getMeetingSummary('cc_2025_01_15');
    console.log(`   Summary: ${summary.summary.substring(0, 200)}...`);
    console.log(`   Key decisions:`);
    const decisions = typeof summary.key_decisions === 'string' ? JSON.parse(summary.key_decisions) : summary.key_decisions;
    decisions.forEach((decision, i) => {
      console.log(`     ${i + 1}. ${decision.decision} (Vote: ${decision.vote})`);
    });
    console.log();

    // Test 6: List meetings
    console.log('6️⃣  Testing listMeetings()...');
    const meetings = await db.listMeetings({
      meeting_type: 'City Commission',
      status: 'chunked',
      limit: 10,
    });
    console.log(`   Found ${meetings.length} City Commission meetings with status 'chunked':`);
    meetings.forEach(m => {
      console.log(`     • ${m.date}: ${m.title}`);
    });
    console.log();

    console.log('✅ All query tests passed!\n');
    console.log('💡 The schema works great with realistic data!');
    console.log('   • Meetings ✓');
    console.log('   • Chunks ✓');
    console.log('   • Transcript lines ✓');
    console.log('   • Speaker relationships ✓');
    console.log('   • Meeting summaries ✓');
    console.log('   • Full-text search ✓\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await close();
  }
}

testQueries();
