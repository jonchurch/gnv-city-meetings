import { promises as fs } from 'fs';
import {
  ChunksResponseSchema,
  WHOLE_MEETING_SYSTEM_PROMPT,
  buildSectionSystemPrompt,
  buildUserMessage,
  validateChunkCoverage,
} from '../../workers/chunking-shared.js';
import { formatTranscriptWindowForLLM } from '../../workers/utils.js';

/**
 * Load transcript lines from a WhisperX diarized JSON file
 * (same shape parseDiarizedOutput consumes in the diarize worker).
 */
export async function loadTranscriptFromFile(filePath) {
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  if (!data.segments || !Array.isArray(data.segments)) {
    throw new Error(`${filePath}: not a WhisperX output (missing segments array)`);
  }
  return data.segments.map((segment, index) => ({
    id: `local_seg_${index}`,
    start_time: segment.start,
    end_time: segment.end,
    text: (segment.text || '').trim(),
    whisperx_speaker_label: segment.speaker || 'UNKNOWN',
  }));
}

/**
 * Load agenda items from an extract-worker metadata JSON file
 * ({ agendaData: { agendaItems: [{ id, title, timeStart(ms), timeEnd(ms) }] } }).
 * Also accepts a bare { agendaItems: [...] } object for hand-made fixtures.
 */
export async function loadAgendaFromFile(filePath) {
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const items = data.agendaData?.agendaItems || data.agendaItems;
  if (!items || !Array.isArray(items)) {
    throw new Error(`${filePath}: no agendaItems found (expected extract-worker metadata JSON)`);
  }
  return items;
}

/**
 * Partition transcript lines into contiguous sections anchored on agenda
 * item start times. Each timestamped item owns [its start, next item's start);
 * lines before the first item become a "Pre-meeting" section. Item end times
 * are ignored on purpose - bookmark TimeEnd values can gap or overlap, and
 * the partition must cover every line exactly once.
 *
 * @returns {{ sections: Array<{title, agendaItemId, isAgendaItem, firstIndex, lastIndex}>,
 *             unanchoredItems: Array<Object> }}
 */
export function buildAgendaSections(transcriptLines, agendaItems) {
  const anchored = agendaItems
    .filter((item) => item.timeStart != null)
    .sort((a, b) => a.timeStart - b.timeStart);
  const unanchoredItems = agendaItems.filter((item) => item.timeStart == null);

  if (anchored.length === 0) {
    return { sections: [], unanchoredItems };
  }

  // For each line, find the last agenda item that started at or before it.
  const sectionOf = transcriptLines.map((line) => {
    let owner = -1; // -1 = pre-meeting
    for (let i = 0; i < anchored.length; i++) {
      if (anchored[i].timeStart / 1000 <= line.start_time) owner = i;
      else break;
    }
    return owner;
  });

  const sections = [];
  let current = null;
  sectionOf.forEach((owner, index) => {
    if (current && current.owner === owner) {
      current.lastIndex = index;
      return;
    }
    current = {
      owner,
      title: owner === -1 ? 'Pre-meeting / Call to order' : anchored[owner].title,
      agendaItemId: owner === -1 ? null : anchored[owner].id,
      isAgendaItem: owner !== -1,
      firstIndex: index,
      lastIndex: index,
    };
    sections.push(current);
  });

  return {
    sections: sections.map(({ owner, ...section }) => section),
    unanchoredItems,
  };
}

async function callChunkingLLM({ openai, model, systemPrompt, formattedTranscript, label }) {
  const { zodTextFormat } = await import('openai/helpers/zod');
  const response = await openai.responses.parse({
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserMessage(formattedTranscript) },
    ],
    text: {
      format: zodTextFormat(ChunksResponseSchema, 'chunks_response'),
    },
  });
  return {
    label,
    chunks: response.output_parsed.chunks,
    usage: response.usage,
  };
}

async function withRetry(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.error(`  ${label}: failed (${err.message}), retrying once...`);
    return fn();
  }
}

/** Chunk the entire meeting in one LLM call (current production strategy). */
export async function chunkWhole({ transcriptLines, openai, model, plan = false }) {
  const formattedTranscript = formatTranscriptWindowForLLM(transcriptLines, 0);
  const calls = [{
    label: 'whole-meeting',
    systemPrompt: WHOLE_MEETING_SYSTEM_PROMPT,
    segmentRange: { firstIndex: 0, lastIndex: transcriptLines.length - 1 },
    formattedTranscript,
  }];

  if (plan) return { chunks: [], calls, planned: true };

  const result = await withRetry(
    () => callChunkingLLM({ openai, model, systemPrompt: WHOLE_MEETING_SYSTEM_PROMPT, formattedTranscript, label: 'whole-meeting' }),
    'whole-meeting'
  );
  calls[0].usage = result.usage;

  const chunks = renumber(result.chunks.map((chunk) => ({ ...chunk, section: null })));
  return { chunks, calls, planned: false };
}

/**
 * Chunk the meeting one agenda-anchored section at a time. Sections are
 * processed with limited concurrency; segment indices in prompts and
 * responses are global so results merge by concatenation.
 */
export async function chunkAgendaAnchored({ transcriptLines, agendaItems, openai, model, plan = false, concurrency = 3 }) {
  const { sections, unanchoredItems } = buildAgendaSections(transcriptLines, agendaItems);
  if (sections.length === 0) {
    throw new Error('No timestamped agenda items - agenda strategy needs at least one item with timeStart');
  }

  const calls = sections.map((section) => {
    const range = { firstIndex: section.firstIndex, lastIndex: section.lastIndex };
    return {
      label: section.title,
      section,
      systemPrompt: buildSectionSystemPrompt(section, range),
      segmentRange: range,
      formattedTranscript: formatTranscriptWindowForLLM(
        transcriptLines.slice(section.firstIndex, section.lastIndex + 1),
        section.firstIndex
      ),
    };
  });

  if (plan) return { chunks: [], calls, sections, unanchoredItems, planned: true };

  // Simple concurrency pool preserving section order in the results
  const results = new Array(calls.length);
  let next = 0;
  async function workerLoop() {
    while (next < calls.length) {
      const i = next++;
      const call = calls[i];
      console.error(`  chunking section ${i + 1}/${calls.length}: ${call.label}`);
      results[i] = await withRetry(
        () => callChunkingLLM({ openai, model, systemPrompt: call.systemPrompt, formattedTranscript: call.formattedTranscript, label: call.label }),
        call.label
      );
      call.usage = results[i].usage;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, calls.length) }, workerLoop));

  const merged = results.flatMap((result, i) =>
    result.chunks
      .slice()
      .sort((a, b) => a.start_segment_index - b.start_segment_index)
      .map((chunk) => ({
        ...chunk,
        section: {
          title: calls[i].section.title,
          agendaItemId: calls[i].section.agendaItemId,
          isAgendaItem: calls[i].section.isAgendaItem,
        },
      }))
  );

  return { chunks: renumber(merged), calls, sections, unanchoredItems, planned: false };
}

function renumber(chunks) {
  return chunks.map((chunk, i) => ({ ...chunk, sequence_number: i + 1 }));
}

/** Attach derived times and produce the validation report for a merged chunk list. */
export function finalizeRun({ name, strategy, model, transcriptLines, chunks, calls }) {
  const enriched = chunks.map((chunk) => ({
    ...chunk,
    start_time: transcriptLines[chunk.start_segment_index]?.start_time ?? null,
    end_time: transcriptLines[chunk.end_segment_index]?.end_time ?? null,
  }));

  const { errors, gaps } = validateChunkCoverage(enriched, 0, transcriptLines.length - 1);

  const usage = calls.reduce(
    (acc, call) => ({
      input_tokens: acc.input_tokens + (call.usage?.input_tokens || 0),
      output_tokens: acc.output_tokens + (call.usage?.output_tokens || 0),
    }),
    { input_tokens: 0, output_tokens: 0 }
  );

  return {
    name,
    strategy,
    model,
    segment_count: transcriptLines.length,
    chunk_count: enriched.length,
    llm_calls: calls.length,
    usage,
    validation: { errors, gaps },
    chunks: enriched,
    calls: calls.map(({ label, segmentRange, systemPrompt, usage: callUsage }) => ({
      label,
      segmentRange,
      systemPrompt,
      usage: callUsage,
    })),
  };
}

export function fmtTime(seconds) {
  if (seconds == null) return '?';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Render the skim view: the concatenated titles + summaries, in order.
 * This document IS the quality bar - read it top to bottom and ask whether
 * you understand what happened in the meeting.
 */
export function renderSkimView(run) {
  const lines = [];
  lines.push(`# Skim view: ${run.name}`);
  lines.push('');
  lines.push(`strategy: **${run.strategy}** · model: ${run.model} · ${run.chunk_count} chunks over ${run.segment_count} segments · ${run.llm_calls} LLM call(s) · ${run.usage.input_tokens} in / ${run.usage.output_tokens} out tokens`);
  lines.push('');

  let currentSection;
  for (const chunk of run.chunks) {
    const sectionTitle = chunk.section?.title;
    if (sectionTitle && sectionTitle !== currentSection) {
      currentSection = sectionTitle;
      lines.push(`## ${sectionTitle}`);
      lines.push('');
    }
    const duration = chunk.end_time != null && chunk.start_time != null
      ? fmtTime(chunk.end_time - chunk.start_time)
      : '?';
    lines.push(`### ${chunk.sequence_number}. ${chunk.title}`);
    lines.push(`*${chunk.chunk_type} · ${fmtTime(chunk.start_time)} – ${fmtTime(chunk.end_time)} (${duration})*`);
    lines.push('');
    lines.push(chunk.summary);
    if (chunk.key_topics?.length) {
      lines.push('');
      lines.push(`topics: ${chunk.key_topics.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Run report');
  lines.push('');

  const durations = run.chunks
    .filter((c) => c.start_time != null && c.end_time != null)
    .map((c) => c.end_time - c.start_time)
    .sort((a, b) => a - b);
  if (durations.length) {
    const median = durations[Math.floor(durations.length / 2)];
    const under1 = durations.filter((d) => d < 60).length;
    const over5 = durations.filter((d) => d > 300).length;
    lines.push(`- Durations: median ${fmtTime(median)}, min ${fmtTime(durations[0])}, max ${fmtTime(durations[durations.length - 1])}; ${under1} under 1m, ${over5} over 5m`);
  }

  if (run.validation.errors.length) {
    lines.push(`- **Validation errors (${run.validation.errors.length}):**`);
    run.validation.errors.forEach((e) => lines.push(`  - ${e}`));
  } else {
    lines.push('- No validation errors (no overlaps, indexes in range)');
  }

  if (run.validation.gaps.length) {
    lines.push(`- **Coverage gaps (${run.validation.gaps.length}) - these segments appear in no chunk:**`);
    run.validation.gaps.forEach((g) => lines.push(`  - segments ${g.start}-${g.end}`));
  } else {
    lines.push('- Full coverage: every segment belongs to a chunk');
  }

  return lines.join('\n');
}
