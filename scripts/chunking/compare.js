#!/usr/bin/env node
// Compare two chunking runs produced by dry-run.js.
//
// Usage:
//   node scripts/chunking/compare.js a.run.json b.run.json [--tolerance 10] [--out compare.md]
//
// Prints (or writes) a markdown report: per-run stats, boundary agreement
// (how many of one run's chunk starts land within N seconds of the other's),
// and the places they disagree most.

import { promises as fs } from 'fs';
import { parseArgs } from 'node:util';
import { fmtTime } from './lib.js';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tolerance: { type: 'string', default: '10' },
    out: { type: 'string' },
  },
});

function boundaryAgreement(from, to, toleranceSec) {
  const toStarts = to.chunks.map((c) => c.start_time).filter((t) => t != null);
  const matched = [];
  const unmatched = [];
  for (const chunk of from.chunks) {
    if (chunk.start_time == null) continue;
    const nearest = toStarts.reduce(
      (best, t) => (Math.abs(t - chunk.start_time) < Math.abs(best - chunk.start_time) ? t : best),
      Infinity
    );
    (Math.abs(nearest - chunk.start_time) <= toleranceSec ? matched : unmatched).push(chunk);
  }
  return { matched, unmatched };
}

function stats(run) {
  const durations = run.chunks
    .filter((c) => c.start_time != null && c.end_time != null)
    .map((c) => c.end_time - c.start_time)
    .sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;
  return {
    chunks: run.chunk_count,
    calls: run.llm_calls,
    median,
    min: durations[0],
    max: durations[durations.length - 1],
    gaps: run.validation.gaps.length,
    errors: run.validation.errors.length,
    tokens: run.usage,
  };
}

async function main() {
  if (positionals.length !== 2) {
    console.error('Usage: node scripts/chunking/compare.js <a.run.json> <b.run.json> [--tolerance 10] [--out compare.md]');
    process.exit(1);
  }
  const toleranceSec = Number(args.tolerance);
  const [a, b] = await Promise.all(positionals.map(async (p) => JSON.parse(await fs.readFile(p, 'utf8'))));

  const lines = [];
  lines.push(`# Chunking comparison: ${a.name}`);
  lines.push('');
  lines.push(`| | A: ${a.strategy} | B: ${b.strategy} |`);
  lines.push('|---|---|---|');
  const [sa, sb] = [stats(a), stats(b)];
  lines.push(`| model | ${a.model} | ${b.model} |`);
  lines.push(`| chunks | ${sa.chunks} | ${sb.chunks} |`);
  lines.push(`| LLM calls | ${sa.calls} | ${sb.calls} |`);
  lines.push(`| median duration | ${fmtTime(sa.median)} | ${fmtTime(sb.median)} |`);
  lines.push(`| min / max duration | ${fmtTime(sa.min)} / ${fmtTime(sa.max)} | ${fmtTime(sb.min)} / ${fmtTime(sb.max)} |`);
  lines.push(`| coverage gaps | ${sa.gaps} | ${sb.gaps} |`);
  lines.push(`| validation errors | ${sa.errors} | ${sb.errors} |`);
  lines.push(`| tokens in / out | ${sa.tokens.input_tokens} / ${sa.tokens.output_tokens} | ${sb.tokens.input_tokens} / ${sb.tokens.output_tokens} |`);
  lines.push('');

  const aToB = boundaryAgreement(a, b, toleranceSec);
  const bToA = boundaryAgreement(b, a, toleranceSec);
  lines.push(`## Boundary agreement (±${toleranceSec}s)`);
  lines.push('');
  lines.push(`- ${aToB.matched.length}/${a.chunks.length} of A's chunk starts have a matching B boundary`);
  lines.push(`- ${bToA.matched.length}/${b.chunks.length} of B's chunk starts have a matching A boundary`);
  lines.push('');

  for (const [label, unmatched] of [['A boundaries with no B counterpart', aToB.unmatched], ['B boundaries with no A counterpart', bToA.unmatched]]) {
    if (!unmatched.length) continue;
    lines.push(`### ${label}`);
    lines.push('');
    unmatched.forEach((c) => lines.push(`- ${fmtTime(c.start_time)} · ${c.title} *(${c.chunk_type})*`));
    lines.push('');
  }

  lines.push('## Side-by-side timelines');
  lines.push('');
  for (const [label, run] of [['A', a], ['B', b]]) {
    lines.push(`### ${label}: ${run.strategy}`);
    lines.push('');
    run.chunks.forEach((c) => {
      const duration = c.start_time != null && c.end_time != null ? fmtTime(c.end_time - c.start_time) : '?';
      lines.push(`- ${fmtTime(c.start_time)} (${duration}) ${c.title}`);
    });
    lines.push('');
  }

  const report = lines.join('\n');
  if (args.out) {
    await fs.writeFile(args.out, report);
    console.error(`wrote ${args.out}`);
  } else {
    console.log(report);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
