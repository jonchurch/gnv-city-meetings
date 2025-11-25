"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { YouTubePlayer, type YouTubePlayerHandle } from "./YouTubePlayer";
import { Transcript } from "./Transcript";
import type { TranscriptLine } from "@/lib/types";

interface VideoTranscriptProps {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  transcriptLines: TranscriptLine[];
  summary: string;
}

export function VideoTranscript({
  videoId,
  startTime,
  endTime,
  title,
  transcriptLines,
  summary,
}: VideoTranscriptProps) {
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState<number>(startTime);

  // Poll player time for transcript highlighting
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current?.isPlaying()) {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
    setCurrentTime(time);
  }, []);

  return (
    <div className="space-y-6">
      <YouTubePlayer
        ref={playerRef}
        videoId={videoId}
        startTime={startTime}
        endTime={endTime}
        title={title}
      />

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Summary</h2>
        <p className="text-muted-foreground leading-relaxed">{summary}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Transcript</h2>
        <Transcript
          lines={transcriptLines}
          currentTime={currentTime}
          onSeek={handleSeek}
        />
      </section>
    </div>
  );
}
