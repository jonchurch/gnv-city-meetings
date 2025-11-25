"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayerInternal }) => void;
            onStateChange?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayerInternal;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayerInternal {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  destroy: () => void;
}

export interface YouTubePlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
  isPlaying: () => boolean;
}

interface YouTubePlayerProps {
  videoId: string;
  startTime?: number;
  endTime?: number;
  title?: string;
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    window.onYouTubeIframeAPIReady = () => resolve();

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });

  return apiLoadPromise;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId, startTime = 0, endTime, title }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YTPlayerInternal | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const playerIdRef = useRef(`yt-player-${Math.random().toString(36).slice(2)}`);
    const isPlayingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        playerRef.current?.seekTo(seconds, true);
        playerRef.current?.playVideo();
      },
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      isPlaying: () => isPlayingRef.current,
    }));

    useEffect(() => {
      let destroyed = false;

      const startEndTimeCheck = () => {
        if (intervalRef.current || endTime === undefined) return;

        intervalRef.current = setInterval(() => {
          if (playerRef.current && playerRef.current.getCurrentTime() >= endTime) {
            playerRef.current.pauseVideo();
          }
        }, 250);
      };

      const stopEndTimeCheck = () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };

      loadYouTubeAPI().then(() => {
        if (destroyed || !containerRef.current) return;

        const playerDiv = document.createElement("div");
        playerDiv.id = playerIdRef.current;
        containerRef.current.appendChild(playerDiv);

        playerRef.current = new window.YT.Player(playerIdRef.current, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            start: Math.floor(startTime),
            cc_load_policy: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onStateChange: (event) => {
              isPlayingRef.current = event.data === window.YT.PlayerState.PLAYING;
              if (isPlayingRef.current) {
                startEndTimeCheck();
              } else {
                stopEndTimeCheck();
              }
            },
          },
        });
      });

      return () => {
        destroyed = true;
        stopEndTimeCheck();
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      };
    }, [videoId, startTime, endTime]);

    return (
      <div className="aspect-video w-full">
        <div
          ref={containerRef}
          className="w-full h-full rounded-lg overflow-hidden"
          title={title}
        />
      </div>
    );
  }
);
