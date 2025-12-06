"use client";

import { useEffect, useRef, useMemo } from "react";
import type { TranscriptLine } from "@/lib/types";
import { formatTime } from "@/lib/api";

interface TranscriptProps {
  lines: TranscriptLine[];
  currentTime?: number | null;
  onSeek?: (time: number) => void;
}

export function Transcript({ lines, currentTime, onSeek }: TranscriptProps) {
  const activeLineRef = useRef<HTMLParagraphElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Group consecutive lines by speaker
  const groupedLines = useMemo(() => {
    const groups: { speaker: string; lines: TranscriptLine[] }[] = [];

    for (const line of lines) {
      const speaker = line.speaker?.name || line.whisperx_speaker_label;
      const lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.speaker === speaker) {
        lastGroup.lines.push(line);
      } else {
        groups.push({ speaker, lines: [line] });
      }
    }
    return groups;
  }, [lines]);

  // Find active line index in flat list
  const activeIndex = useMemo(() => {
    if (currentTime == null) return -1;
    return lines.findIndex(
      (line) => currentTime >= line.start_time && currentTime < line.end_time
    );
  }, [lines, currentTime]);

  const getLineState = (line: TranscriptLine): "past" | "active" | "future" => {
    if (currentTime == null) return "future";
    if (currentTime >= line.start_time && currentTime < line.end_time) return "active";
    if (currentTime >= line.end_time) return "past";
    return "future";
  };

  const getFutureDistance = (line: TranscriptLine): number => {
    if (activeIndex === -1) return 0;
    const lineIndex = lines.indexOf(line);
    return lineIndex - activeIndex;
  };

  // Scroll active line to center of container
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const lineEl = activeLineRef.current;
      const offsetTop = lineEl.offsetTop - container.offsetTop;
      const centerOffset = offsetTop - container.clientHeight / 2 + lineEl.clientHeight / 2;

      container.scrollTo({
        top: centerOffset,
        behavior: "smooth",
      });
    }
  }, [currentTime]);

  return (
    <div ref={containerRef} className="space-y-6 h-96 overflow-y-auto">
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
          <div className="pl-4 space-y-2">
            {group.lines.map((line) => {
              const state = getLineState(line);
              const futureDistance = getFutureDistance(line);

              // Future lines: fade in based on distance (0-2 lines ahead visible)
              // 1 ahead = 60% opacity, 2 ahead = 30%, 3+ = 0%
              const futureOpacity =
                state === "future"
                  ? futureDistance <= 0 ? 1 : futureDistance === 1 ? 0.6 : futureDistance === 2 ? 0.3 : 0
                  : 1;

              return (
                <p
                  key={line.id}
                  ref={state === "active" ? activeLineRef : null}
                  data-start={line.start_time}
                  data-end={line.end_time}
                  onClick={() => onSeek?.(line.start_time)}
                  style={state === "future" ? { opacity: futureOpacity } : undefined}
                  className={`
                    ${onSeek ? "cursor-pointer hover:text-foreground hover:opacity-100" : ""}
                    ${state === "active"
                      ? "text-foreground bg-muted px-2 py-1 -mx-2 rounded font-medium"
                      : state === "past"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/70"}
                    transition-all duration-300
                  `}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
