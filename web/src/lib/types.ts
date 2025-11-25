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
