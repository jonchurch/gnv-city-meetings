export type ChunkType = "procedural" | "presentation" | "discussion" | "public-comment" | "vote"

export interface TranscriptLine {
  id: string
  speaker: string
  text: string
  startTime: number // seconds from start of video
  endTime: number
}

export interface ChunkSummary {
  text: string
  keyDecisions?: string[]
  notableQuotes?: { speaker: string; quote: string; timestamp?: number }[]
}

export interface Chunk {
  id: string
  meetingId: string
  title: string
  type: ChunkType
  startTime: number // seconds
  endTime: number
  summary: string | ChunkSummary
  transcript: TranscriptLine[]
  agendaId?: string // Link chunk to parent agenda item
}

export interface AgendaItem {
  id: string
  title: string
  order: number
  chunkIds: string[] // chunks that belong to this agenda item
}

export interface Meeting {
  id: string
  title: string
  date: string
  type: string
  youtubeId: string
  summary?: string
  chunks: Chunk[]
  agenda?: AgendaItem[] // Add agenda items to meeting
}

export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

export function formatDuration(startTime: number, endTime: number): string {
  const duration = endTime - startTime
  const minutes = Math.floor(duration / 60)
  if (minutes < 1) return "Less than 1 min"
  if (minutes === 1) return "1 min"
  return `${minutes} mins`
}

export function getChunkTypeLabel(type: ChunkType): string {
  const labels: Record<ChunkType, string> = {
    procedural: "Procedural",
    presentation: "Presentation",
    discussion: "Discussion",
    "public-comment": "Public Comment",
    vote: "Vote",
  }
  return labels[type]
}

export function getChunkTypeColor(type: ChunkType): string {
  const colors: Record<ChunkType, string> = {
    procedural: "bg-muted text-muted-foreground",
    presentation: "bg-primary/10 text-primary",
    discussion: "bg-accent/10 text-accent",
    "public-comment": "bg-chart-3/10 text-chart-3",
    vote: "bg-chart-5/10 text-chart-5",
  }
  return colors[type]
}
