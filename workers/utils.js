/**
 * Format a window of transcript lines for LLM input, numbering lines with
 * a global index offset so per-section outputs can reference meeting-wide
 * segment indices.
 * @param {Array<Object>} transcriptLines
 * @param {number} indexOffset - global index of the first line in the window
 * @returns {string}
 */
export function formatTranscriptWindowForLLM(transcriptLines, indexOffset = 0) {
  return transcriptLines
    .map((line, i) => {
      const idx = indexOffset + i;
      const startMin = Math.floor(line.start_time / 60);
      const startSec = Math.floor(line.start_time % 60);
      const endMin = Math.floor(line.end_time / 60);
      const endSec = Math.floor(line.end_time % 60);

      return `[${idx}] ${startMin}:${startSec.toString().padStart(2, '0')} - ${endMin}:${endSec.toString().padStart(2, '0')} | ${line.whisperx_speaker_label}: ${line.text.trim()}`;
    })
    .join('\n');
}

/**
 * Format transcript lines for LLM input
 * @param {Array<Object>} transcriptLines
 * @returns {string}
 */
export function formatTranscriptForLLM(transcriptLines) {
  return formatTranscriptWindowForLLM(transcriptLines, 0);
}
