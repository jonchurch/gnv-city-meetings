"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChunkHeader } from "./ChunkHeader";
import { ChunkNav } from "./ChunkNav";
import { YouTubePlayer, YouTubePlayerHandle } from "./YouTubePlayer";
import { ChunkSummary } from "./ChunkSummary";
import { TranscriptViewer } from "./TranscriptViewer";
import { MeetingTocSidebar } from "./MeetingTocSidebar";
import { X } from "lucide-react";
import type { Chunk, ChunkWithTranscript, MeetingWithChunks } from "@/lib/types";
import { getYouTubeVideoId } from "@/lib/api";

interface ChunkPageContentProps {
  chunk: ChunkWithTranscript;
  meeting: MeetingWithChunks;
  prevChunk?: Chunk;
  nextChunk?: Chunk;
  currentIndex: number;
  totalChunks: number;
}

export function ChunkPageContent({
  chunk,
  meeting,
  prevChunk,
  nextChunk,
  currentIndex,
  totalChunks,
}: ChunkPageContentProps) {
  const [currentTime, setCurrentTime] = useState(chunk.start_time);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);

  const mainVideoRef = useRef<HTMLDivElement>(null);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  const [miniPlayerDismissed, setMiniPlayerDismissed] = useState(false);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const videoId = getYouTubeVideoId(meeting.youtube_url);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handlePlayerReady = useCallback((player: YouTubePlayerHandle) => {
    playerRef.current = player;
  }, []);

  const handleLineClick = useCallback((time: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(time);
      setCurrentTime(time);
    }
  }, []);

  useEffect(() => {
    const videoElement = mainVideoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!miniPlayerDismissed) {
          setShowMiniPlayer(!entry.isIntersecting || entry.intersectionRatio < 0.3);
        }
      },
      { threshold: [0, 0.3, 1] }
    );

    observer.observe(videoElement);
    return () => observer.disconnect();
  }, [miniPlayerDismissed]);

  const handleScrollToVideo = useCallback(() => {
    mainVideoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setMiniPlayerDismissed(false);
  }, []);

  if (!videoId) {
    return <div className="text-muted-foreground">No video available</div>;
  }

  return (
    <div className="min-h-screen">
      {/* Floating ToC - fixed position, always visible but ghosted */}
      <div className="hidden xl:block">
        <MeetingTocSidebar
          meeting={meeting}
          currentSequence={chunk.sequence_number}
        />
      </div>

      <ChunkHeader
        chunk={chunk}
        meeting={meeting}
        currentIndex={currentIndex}
        totalChunks={totalChunks}
        onMenuClick={() => setMobileSidebarOpen(true)}
      />

      <main className="max-w-3xl mx-auto px-6 py-12 sm:px-8 lg:px-12 xl:ml-72">
        {/* Video */}
        <div ref={mainVideoRef} className="mb-12">
          <YouTubePlayer
            videoId={videoId}
            startTime={chunk.start_time}
            onTimeUpdate={handleTimeUpdate}
            onPlayerReady={handlePlayerReady}
          />
        </div>

        {/* Summary */}
        <div className="mb-16">
          <ChunkSummary summary={chunk.summary} onQuoteClick={handleLineClick} />
        </div>

        {/* Transcript */}
        <TranscriptViewer
          transcript={chunk.transcript_lines}
          currentTime={currentTime}
          onLineClick={handleLineClick}
        />

        {/* Navigation */}
        <div className="mt-16 pt-10 border-t border-border">
          <ChunkNav
            meetingId={meeting.id}
            prevChunk={prevChunk}
            nextChunk={nextChunk}
          />
        </div>
      </main>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 xl:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-background border-r border-border z-50 xl:hidden overflow-y-auto">
            <div className="px-5 py-6">
              <div className="flex items-center justify-between mb-5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  On this meeting
                </p>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1 -mr-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="space-y-1">
                {meeting.chunks.map((c) => {
                  const isActive = c.sequence_number === chunk.sequence_number;
                  return (
                    <a
                      key={c.id}
                      href={`/meetings/${meeting.id}/chunks/${c.sequence_number}`}
                      onClick={() => setMobileSidebarOpen(false)}
                      className={`block py-2 px-2 text-[13px] leading-relaxed rounded ${
                        isActive
                          ? "text-foreground font-medium bg-muted"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {c.title}
                    </a>
                  );
                })}
              </nav>
            </div>
          </div>
        </>
      )}

      {/* Floating mini player */}
      {showMiniPlayer && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="w-72 rounded-lg overflow-hidden shadow-xl ring-1 ring-border bg-background">
            <button
              onClick={handleScrollToVideo}
              className="relative aspect-video w-full bg-muted cursor-pointer group/thumb"
            >
              <img
                src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                alt="Video thumbnail"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                <span className="text-white text-sm font-medium">
                  Back to video
                </span>
              </div>
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 text-white text-xs px-2 py-1 rounded">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                Playing
              </div>
            </button>

            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground truncate flex-1">
                {chunk.title}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMiniPlayer(false);
                  setMiniPlayerDismissed(true);
                }}
                className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                aria-label="Dismiss mini player"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
