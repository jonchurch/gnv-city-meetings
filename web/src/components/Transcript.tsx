import type { TranscriptLine } from "@/lib/types";
import { formatTime } from "@/lib/api";

interface TranscriptProps {
  lines: TranscriptLine[];
}

export function Transcript({ lines }: TranscriptProps) {
  // Group consecutive lines by speaker
  const groupedLines: { speaker: string; lines: TranscriptLine[] }[] = [];

  for (const line of lines) {
    const speaker = line.speaker?.name || line.whisperx_speaker_label;
    const lastGroup = groupedLines[groupedLines.length - 1];

    if (lastGroup && lastGroup.speaker === speaker) {
      lastGroup.lines.push(line);
    } else {
      groupedLines.push({ speaker, lines: [line] });
    }
  }

  return (
    <div className="space-y-6">
      {groupedLines.map((group, groupIndex) => (
        <div key={groupIndex} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-foreground">
              {group.speaker}
            </span>
            <span className="text-xs text-muted-foreground">
              [{formatTime(group.lines[0].start_time)}]
            </span>
          </div>
          <div className="pl-4 space-y-2 text-muted-foreground">
            {group.lines.map((line) => (
              <p key={line.id} data-start={line.start_time} data-end={line.end_time}>
                {line.text}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
