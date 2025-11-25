#!/usr/bin/env node
import { promises as fs } from 'fs';

import * as pgDb from '../db/queries.js';
import { formatTranscriptForLLM } from '../workers/utils.js';

const meetingId = process.argv[2] || '0d57b610-0b15-4722-92bb-601620387cf5';

async function main() {
  console.log(`Fetching transcript lines for meeting: ${meetingId}`);

  const transcriptLines = await pgDb.getTranscriptLines(meetingId);

  console.log(`Found ${transcriptLines.length} transcript lines`);

  const formatted = formatTranscriptForLLM(transcriptLines);

  const outputPath = `transcript_formatted_${meetingId}.txt`;
  await fs.writeFile(outputPath, formatted);

  console.log(`Saved formatted transcript to: ${outputPath}`);
  console.log(`Character count: ${formatted.length}`);
  console.log(`Estimated tokens (rough): ${Math.ceil(formatted.length / 4)}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
