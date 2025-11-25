/**
 * Format transcript lines for LLM input
 * @param {Array<Object>} transcriptLines
 * @returns {string}
 */
export function formatTranscriptForLLM(transcriptLines) {
  return transcriptLines
    .map((line, idx) => {
      const startMin = Math.floor(line.start_time / 60);
      const startSec = Math.floor(line.start_time % 60);
      const endMin = Math.floor(line.end_time / 60);
      const endSec = Math.floor(line.end_time % 60);

      return `[${idx}] ${startMin}:${startSec.toString().padStart(2, '0')} - ${endMin}:${endSec.toString().padStart(2, '0')} | ${line.whisperx_speaker_label}: ${line.text.trim()}`;
    })
    .join('\n');
}


