#!/usr/bin/env node
// Dry-run chunking harness: run a chunking strategy against a transcript and
// write the results to files for inspection. Never touches the database.
//
// Usage:
//   node scripts/chunking/dry-run.js --file Finance_Committee_diarized.json --strategy whole
//   node scripts/chunking/dry-run.js --file X_diarized.json --agenda X_metadata.json --strategy agenda
//   node scripts/chunking/dry-run.js --meeting <meeting-id> --strategy whole   (loads from Postgres)
//
// Flags:
//   --plan        don't call the LLM; write the planned sections + prompts instead
//   --model       override model (default: CHUNKING_MODEL env or gpt-5.1)
//   --name        label for output files (default: derived from input)
//   --out         output directory (default: downloads/derived/chunking-experiments)
//
// Outputs: <out>/<name>.<strategy>.run.json (full data, feed to compare.js)
//          <out>/<name>.<strategy>.skim.md  (titles+summaries in order - the quality bar)

import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { parseArgs } from 'node:util';
import {
  loadTranscriptFromFile,
  loadAgendaFromFile,
  chunkWhole,
  chunkAgendaAnchored,
  finalizeRun,
  renderSkimView,
  fmtTime,
} from './lib.js';
import { CHUNKING_MODEL } from '../../workers/chunking-shared.js';

const { values: args } = parseArgs({
  options: {
    file: { type: 'string' },
    meeting: { type: 'string' },
    agenda: { type: 'string' },
    strategy: { type: 'string', default: 'whole' },
    model: { type: 'string', default: CHUNKING_MODEL },
    name: { type: 'string' },
    out: { type: 'string', default: 'downloads/derived/chunking-experiments' },
    plan: { type: 'boolean', default: false },
  },
});

function usage(message) {
  console.error(`Error: ${message}\n`);
  console.error('See header comment in scripts/chunking/dry-run.js for usage.');
  process.exit(1);
}

async function main() {
  if (!args.file && !args.meeting) usage('need --file <diarized.json> or --meeting <id>');
  if (!['whole', 'agenda'].includes(args.strategy)) usage('--strategy must be whole or agenda');
  if (args.strategy === 'agenda' && !args.agenda && !args.meeting) {
    usage('agenda strategy needs --agenda <metadata.json>');
  }

  // Load transcript
  let transcriptLines;
  let defaultName;
  if (args.file) {
    transcriptLines = await loadTranscriptFromFile(args.file);
    defaultName = path.basename(args.file).replace(/(_diarized)?\.json$/, '');
  } else {
    const pgDb = await import('../../db/queries.js');
    transcriptLines = await pgDb.getTranscriptLines(args.meeting);
    if (!transcriptLines?.length) throw new Error(`No transcript lines for meeting ${args.meeting}`);
    defaultName = args.meeting;
  }
  const name = args.name || defaultName;
  console.error(`${name}: ${transcriptLines.length} segments, ${fmtTime(transcriptLines[transcriptLines.length - 1].end_time)} of audio`);

  // Load agenda if needed
  let agendaItems = null;
  if (args.strategy === 'agenda') {
    if (args.agenda) {
      agendaItems = await loadAgendaFromFile(args.agenda);
    } else {
      const { pathFor, StorageTypes } = await import('../../storage/paths.js');
      agendaItems = await loadAgendaFromFile(pathFor(StorageTypes.DERIVED_METADATA, args.meeting));
    }
    const anchored = agendaItems.filter((i) => i.timeStart != null).length;
    console.error(`agenda: ${agendaItems.length} items, ${anchored} with timestamps`);
  }

  let openai = null;
  if (!args.plan) {
    if (!process.env.OPENAI_API_KEY) usage('OPENAI_API_KEY required (or pass --plan to skip the LLM)');
    const { default: OpenAI } = await import('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  const strategyArgs = { transcriptLines, agendaItems, openai, model: args.model, plan: args.plan };
  const result = args.strategy === 'whole'
    ? await chunkWhole(strategyArgs)
    : await chunkAgendaAnchored(strategyArgs);

  await fs.mkdir(args.out, { recursive: true });
  const base = path.join(args.out, `${name}.${args.strategy}`);

  if (args.plan) {
    // Write the planned calls (sections + exact prompts), no LLM involved
    const planOut = `${base}.plan.json`;
    await fs.writeFile(planOut, JSON.stringify({ name, strategy: args.strategy, model: args.model, calls: result.calls, unanchoredItems: result.unanchoredItems || [] }, null, 2));
    console.error(`\nplan mode: ${result.calls.length} LLM call(s) would be made:`);
    for (const call of result.calls) {
      const seg = call.segmentRange;
      const from = transcriptLines[seg.firstIndex];
      const to = transcriptLines[seg.lastIndex];
      console.error(`  - ${call.label}: segments ${seg.firstIndex}-${seg.lastIndex} (${fmtTime(from.start_time)} – ${fmtTime(to.end_time)})`);
    }
    if (result.unanchoredItems?.length) {
      console.error(`  ! ${result.unanchoredItems.length} agenda item(s) had no timestamp and are folded into neighboring sections`);
    }
    console.error(`\nwrote ${planOut}`);
    return;
  }

  const run = finalizeRun({ name, strategy: args.strategy, model: args.model, transcriptLines, chunks: result.chunks, calls: result.calls });

  await fs.writeFile(`${base}.run.json`, JSON.stringify(run, null, 2));
  await fs.writeFile(`${base}.skim.md`, renderSkimView(run));

  console.error(`\n${run.chunk_count} chunks, ${run.validation.errors.length} validation errors, ${run.validation.gaps.length} coverage gaps`);
  console.error(`wrote ${base}.run.json`);
  console.error(`wrote ${base}.skim.md   <- read this one`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
