"use client"

import Link from "next/link"
import { ChevronLeft, List } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import type { Chunk, Meeting } from "@/lib/types"
import { formatTimestamp, formatDuration, getChunkTypeLabel, getChunkTypeColor } from "@/lib/types"

interface ChunkHeaderProps {
  chunk: Chunk
  meeting: Meeting
  currentIndex: number
  totalChunks: number
  onMenuClick?: () => void
}

export function ChunkHeader({ chunk, meeting, currentIndex, totalChunks, onMenuClick }: ChunkHeaderProps) {
  const formattedDate = new Date(meeting.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return (
    <header className="border-b border-border/50 bg-background">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Breadcrumb with progress */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {onMenuClick && (
              <button
                onClick={onMenuClick}
                className="lg:hidden p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                aria-label="Open meeting outline"
              >
                <List className="h-5 w-5" />
              </button>
            )}

            <Link
              href={`/meetings/${meeting.id}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{meeting.title}</span>
              <span className="sm:hidden">Back</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {currentIndex} of {totalChunks}
            </span>
          </div>
        </div>

        {/* Title row - cleaner with badge inline */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{chunk.title}</h1>
          <Badge variant="secondary" className={`${getChunkTypeColor(chunk.type)} text-xs font-medium`}>
            {getChunkTypeLabel(chunk.type)}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          {formattedDate}
          <span className="mx-2 text-border">·</span>
          <span className="font-mono text-xs">{formatTimestamp(chunk.startTime)}</span>
          <span className="text-muted-foreground/50 mx-1">→</span>
          <span className="font-mono text-xs">{formatTimestamp(chunk.endTime)}</span>
          <span className="text-muted-foreground/60 ml-1">({formatDuration(chunk.startTime, chunk.endTime)})</span>
        </p>
      </div>
    </header>
  )
}
