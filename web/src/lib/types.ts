export interface Meeting {
  id: string;
  title: string;
  meeting_type: string;
  date: string;
  escribe_url: string | null;
  youtube_url: string | null;
  processing_status: string;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  meeting_id: string;
  sequence_number: number;
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  chunk_type: string;
}

export interface MeetingWithChunks extends Meeting {
  chunks: Chunk[];
}

export interface Speaker {
  id: string | null;
  name: string | null;
  role: string | null;
  title: string | null;
}

export interface TranscriptLine {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  speaker: Speaker;
  whisperx_speaker_label: string;
  voiceprint_confidence: number | null;
  was_corrected_by_llm: boolean;
}

export interface ChunkWithTranscript extends Chunk {
  transcript_lines: TranscriptLine[];
}

export interface SearchResult {
  id: string;
  meeting_id: string;
  chunk_id: string;
  start_time: number;
  end_time: number;
  text: string;
  whisperx_speaker_label: string;
}

export interface PaginationInfo {
  limit: number;
  offset: number;
  count: number;
}

export interface MeetingsResponse {
  data: Meeting[];
  pagination: PaginationInfo;
}

export interface SearchResponse {
  query: string;
  data: SearchResult[];
  count: number;
}

// Helper functions for formatting

export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatDuration(startTime: number, endTime: number): string {
  const duration = endTime - startTime;
  const minutes = Math.floor(duration / 60);
  if (minutes < 1) return "Less than 1 min";
  if (minutes === 1) return "1 min";
  return `${minutes} mins`;
}

export function getChunkTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    procedural: "Procedural",
    presentation: "Presentation",
    discussion: "Discussion",
    "public-comment": "Public Comment",
    "public_comment": "Public Comment",
    vote: "Vote",
  };
  return labels[type] || type;
}

export function getChunkTypeColor(type: string): string {
  const colors: Record<string, string> = {
    procedural: "bg-muted text-muted-foreground",
    presentation: "bg-primary/10 text-primary",
    discussion: "bg-accent/10 text-accent-foreground",
    "public-comment": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    "public_comment": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    vote: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };
  return colors[type] || "bg-muted text-muted-foreground";
}
