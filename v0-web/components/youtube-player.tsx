"use client"

import { useEffect, useRef, useCallback } from "react"

declare global {
  interface Window {
    YT: any // Declare YT as any to avoid undeclared variable error
    onYouTubeIframeAPIReady: () => void
  }
}

interface YouTubePlayerProps {
  videoId: string
  startTime: number
  onTimeUpdate?: (time: number) => void
  onPlayerReady?: (player: any) => void // Declare player as any to avoid undeclared variable error
}

export function YouTubePlayer({ videoId, startTime, onTimeUpdate, onPlayerReady }: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any | null>(null) // Declare playerRef as any to avoid undeclared variable error
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const setupTimeTracking = useCallback(
    (player: any) => {
      // Declare player as any to avoid undeclared variable error
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }

      intervalRef.current = setInterval(() => {
        if (player && typeof player.getCurrentTime === "function") {
          const currentTime = player.getCurrentTime()
          onTimeUpdate?.(currentTime)
        }
      }, 250)
    },
    [onTimeUpdate],
  )

  useEffect(() => {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      const firstScriptTag = document.getElementsByTagName("script")[0]
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
    }

    const initPlayer = () => {
      if (!containerRef.current) return

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          start: Math.floor(startTime),
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event) => {
            onPlayerReady?.(event.target)
            setupTimeTracking(event.target)
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setupTimeTracking(event.target)
            }
          },
        },
      })
    }

    if (window.YT && window.YT.Player) {
      initPlayer()
    } else {
      window.onYouTubeIframeAPIReady = initPlayer
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (playerRef.current) {
        playerRef.current.destroy()
      }
    }
  }, [videoId, startTime, onPlayerReady, setupTimeTracking])

  return (
    <div className="aspect-video w-full bg-muted rounded-xl overflow-hidden shadow-sm ring-1 ring-border/50">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
