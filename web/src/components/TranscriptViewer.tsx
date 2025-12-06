"use client";

import { useRef, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TranscriptLine } from "@/lib/types";
import { formatTimestamp, formatDuration } from "@/lib/types";
import { Users, Clock } from "lucide-react";

interface TranscriptViewerProps {
  transcript: TranscriptLine[];
  currentTime: number;
  onLineClick: (time: number) => void;
}

const speakerColors = [
  { dot: "bg-blue-500", active: "bg-blue-500/5 border-blue-500/20" },
  { dot: "bg-emerald-500", active: "bg-emerald-500/5 border-emerald-500/20" },
  { dot: "bg-amber-500", active: "bg-amber-500/5 border-amber-500/20" },
  { dot: "bg-rose-500", active: "bg-rose-500/5 border-rose-500/20" },
  { dot: "bg-violet-500", active: "bg-violet-500/5 border-violet-500/20" },
  { dot: "bg-cyan-500", active: "bg-cyan-500/5 border-cyan-500/20" },
];

function getSpeakerKey(line: TranscriptLine): string {
  // Use speaker name if available, fall back to whisperx label
  return line.speaker?.name || line.whisperx_speaker_label || "Unknown";
}

function getSpeakerColor(speakerKey: string, speakerMap: Map<string, number>) {
  if (!speakerMap.has(speakerKey)) {
    speakerMap.set(speakerKey, speakerMap.size % speakerColors.length);
  }
  return speakerColors[speakerMap.get(speakerKey)!];
}

function getSpeakerInitials(speakerKey: string): string {
  return speakerKey
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface Block {
  speakerKey: string;
  lines: TranscriptLine[];
  startTime: number;
  endTime: number;
}

function groupIntoBlocks(transcript: TranscriptLine[]): Block[] {
  return transcript.reduce<Block[]>((blocks, line) => {
    const speakerKey = getSpeakerKey(line);
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.speakerKey === speakerKey) {
      lastBlock.lines.push(line);
      lastBlock.endTime = line.end_time;
    } else {
      blocks.push({
        speakerKey,
        lines: [line],
        startTime: line.start_time,
        endTime: line.end_time,
      });
    }
    return blocks;
  }, []);
}

interface Paragraph {
  lines: TranscriptLine[];
  startTime: number;
  showTimestamp: boolean;
}

const LONG_BLOCK_THRESHOLD_SECONDS = 45;
const PARAGRAPH_INTERVAL_SECONDS = 40;

function splitIntoWaypointedParagraphs(lines: TranscriptLine[]): Paragraph[] {
  if (lines.length === 0) return [];

  const blockDuration = lines[lines.length - 1].end_time - lines[0].start_time;

  if (blockDuration < LONG_BLOCK_THRESHOLD_SECONDS) {
    return [{ lines, startTime: lines[0].start_time, showTimestamp: false }];
  }

  const paragraphs: Paragraph[] = [];
  let currentParagraph: TranscriptLine[] = [];
  let paragraphStartTime = lines[0].start_time;
  let lastWaypointTime = lines[0].start_time;

  for (const line of lines) {
    const timeSinceLastWaypoint = line.start_time - lastWaypointTime;

    if (
      timeSinceLastWaypoint >= PARAGRAPH_INTERVAL_SECONDS &&
      currentParagraph.length > 0
    ) {
      paragraphs.push({
        lines: currentParagraph,
        startTime: paragraphStartTime,
        showTimestamp: paragraphs.length > 0,
      });
      currentParagraph = [];
      paragraphStartTime = line.start_time;
      lastWaypointTime = line.start_time;
    }

    currentParagraph.push(line);
  }

  if (currentParagraph.length > 0) {
    paragraphs.push({
      lines: currentParagraph,
      startTime: paragraphStartTime,
      showTimestamp: paragraphs.length > 0,
    });
  }

  return paragraphs;
}

export function TranscriptViewer({
  transcript,
  currentTime,
  onLineClick,
}: TranscriptViewerProps) {
  const activeBlockRef = useRef<HTMLDivElement>(null);
  const [hoveredBlock, setHoveredBlock] = useState<number | null>(null);

  const speakerMap = useRef(new Map<string, number>()).current;
  const blocks = groupIntoBlocks(transcript);

  const activeBlockIndex = blocks.findIndex(
    (block) => currentTime >= block.startTime && currentTime < block.endTime
  );

  const uniqueSpeakers = useMemo(() => {
    return new Set(transcript.map((line) => getSpeakerKey(line))).size;
  }, [transcript]);

  const totalDuration = useMemo(() => {
    if (transcript.length === 0) return 0;
    return (
      transcript[transcript.length - 1].end_time - transcript[0].start_time
    );
  }, [transcript]);

  return (
    <section aria-labelledby="transcript-heading">
      <div className="flex items-center gap-4 mb-6">
        <div className="h-px flex-1 bg-border" />
        <h2
          id="transcript-heading"
          className="text-sm font-semibold text-muted-foreground uppercase tracking-wider"
        >
          Full Transcript
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          <span>{uniqueSpeakers} speakers</span>
        </div>
        <span className="text-border">•</span>
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          <span>{formatDuration(0, totalDuration)}</span>
        </div>
      </div>

      <div className="space-y-2 max-w-2xl">
        {blocks.map((block, blockIndex) => {
          const isActive = blockIndex === activeBlockIndex;
          const isHovered = hoveredBlock === blockIndex;
          const colors = getSpeakerColor(block.speakerKey, speakerMap);
          const initials = getSpeakerInitials(block.speakerKey);
          const paragraphs = splitIntoWaypointedParagraphs(block.lines);
          const isLongBlock = paragraphs.length > 1;

          return (
            <div
              key={blockIndex}
              ref={isActive ? activeBlockRef : null}
              onMouseEnter={() => setHoveredBlock(blockIndex)}
              onMouseLeave={() => setHoveredBlock(null)}
              className={cn(
                "group rounded-xl transition-all duration-200",
                "px-4 py-4 border border-transparent",
                isActive && [colors.active, "border-current", "shadow-sm"],
                !isActive && "hover:bg-muted/50"
              )}
              aria-current={isActive ? "true" : undefined}
            >
              <div className="flex gap-3">
                <button
                  onClick={() => onLineClick(block.startTime)}
                  className={cn(
                    "shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white transition-transform duration-200",
                    colors.dot,
                    isActive && "scale-110",
                    "hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                  aria-label={`Jump to ${block.speakerKey} at ${formatTimestamp(block.startTime)}`}
                >
                  {initials}
                </button>

                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => onLineClick(block.startTime)}
                    className="flex items-center gap-2 mb-1.5 hover:opacity-80 transition-opacity focus:outline-none focus-visible:underline"
                  >
                    <span className="font-medium text-foreground text-sm">
                      {block.speakerKey}
                    </span>
                    <span className="text-muted-foreground/60 text-xs">·</span>
                    <span
                      className={cn(
                        "font-mono text-xs text-muted-foreground/60 transition-colors duration-200",
                        (isHovered || isActive) && "text-muted-foreground"
                      )}
                    >
                      {formatTimestamp(block.startTime)}
                    </span>
                    {isLongBlock && (
                      <span className="text-xs text-muted-foreground/40 ml-1">
                        ({formatDuration(block.startTime, block.endTime)})
                      </span>
                    )}
                  </button>

                  <div className="space-y-3">
                    {paragraphs.map((paragraph, pIndex) => (
                      <div key={pIndex}>
                        {paragraph.showTimestamp && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onLineClick(paragraph.startTime);
                            }}
                            className={cn(
                              "inline-flex items-center gap-1 mb-2",
                              "px-2 py-0.5 rounded-full",
                              "bg-muted/60 hover:bg-muted",
                              "text-xs font-mono text-muted-foreground hover:text-foreground",
                              "transition-colors duration-150",
                              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            )}
                            aria-label={`Jump to ${formatTimestamp(paragraph.startTime)}`}
                          >
                            {formatTimestamp(paragraph.startTime)}
                          </button>
                        )}
                        <p
                          className={cn(
                            "text-[15px] leading-relaxed transition-colors duration-200",
                            isActive ? "text-foreground" : "text-muted-foreground",
                            isHovered && !isActive && "text-foreground/80"
                          )}
                        >
                          {paragraph.lines.map((line) => line.text).join(" ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
