# Chunking dry-run harness

Tools for iterating on transcript chunking without touching the database or
the pipeline. Run a strategy against a transcript, read the **skim view**,
compare strategies/prompts/models side by side.

## The quality bar

A chunk is the unit a citizen pages through: a stretch of meeting whose 2-3
sentence summary covers it honestly. The concatenated summaries, read in
order, should function as the ~30 minute version of the meeting.

That's what `*.skim.md` is: titles + summaries in order. Judging a run means
reading that file and asking "do I understand what happened in this meeting,
and roughly the points made?" Gaps in coverage are content loss and are
reported at the bottom of the file.

## Strategies

- **whole** — the current production approach: one LLM call gets the entire
  transcript and invents all boundaries.
- **agenda** — agenda-anchored: official agenda item timestamps (scraped by
  the extract worker) fix the top-level boundaries; the LLM only subdivides
  within each item. One LLM call per section, run concurrently, merged by
  global segment index. Segments before the first item become a
  "Pre-meeting / Call to order" section; agenda items without timestamps are
  folded into neighboring sections and reported.

The prompt and output schema are shared with the production worker via
`workers/chunking-shared.js`, so what you test here is what ships.

## Usage

```bash
# From a WhisperX diarized JSON file (no DB needed)
node scripts/chunking/dry-run.js --file Finance_Committee_diarized.json --strategy whole

# Agenda-anchored, using extract-worker metadata JSON
node scripts/chunking/dry-run.js \
  --file downloads/derived/diarized/<id>_diarized.json \
  --agenda downloads/derived/metadata/<id>_metadata.json \
  --strategy agenda

# From Postgres (agenda metadata found automatically via storage paths)
node scripts/chunking/dry-run.js --meeting <meeting-id> --strategy agenda

# See what would be sent without calling the LLM (sections + exact prompts)
node scripts/chunking/dry-run.js --file X_diarized.json --agenda X_meta.json --strategy agenda --plan

# Compare two runs
node scripts/chunking/compare.js \
  downloads/derived/chunking-experiments/X.whole.run.json \
  downloads/derived/chunking-experiments/X.agenda.run.json \
  --out compare.md
```

Flags: `--model` (default `CHUNKING_MODEL` env or gpt-5.1), `--name` (output
label), `--out` (default `downloads/derived/chunking-experiments/`), `--plan`.

Outputs per run:

- `<name>.<strategy>.run.json` — chunks with derived times, per-call prompts
  and token usage, validation report. Input for `compare.js`.
- `<name>.<strategy>.skim.md` — the skim view. Read this one.

`compare.js` reports chunk counts, duration distributions, coverage gaps, and
boundary agreement (how many of one run's chunk starts land within ±10s of
the other's), plus the boundaries unique to each side.
