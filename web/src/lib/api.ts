import type {
  MeetingsResponse,
  MeetingWithChunks,
  ChunkWithTranscript,
  SearchResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getMeetings(params?: {
  limit?: number;
  offset?: number;
  state?: string;
}): Promise<MeetingsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  if (params?.state) searchParams.set("state", params.state);

  const query = searchParams.toString();
  return fetchJson(`/api/meetings${query ? `?${query}` : ""}`);
}

export async function getMeeting(id: string): Promise<MeetingWithChunks> {
  return fetchJson(`/api/meetings/${id}`);
}

export async function getChunk(id: string): Promise<ChunkWithTranscript> {
  return fetchJson(`/api/chunks/${id}`);
}

export async function getChunkBySequence(
  meetingId: string,
  sequence: number
): Promise<ChunkWithTranscript> {
  const chunkId = `${meetingId}_chunk_${sequence}`;
  return getChunk(chunkId);
}

export async function search(
  query: string,
  params?: { meeting_id?: string; limit?: number }
): Promise<SearchResponse> {
  const searchParams = new URLSearchParams({ q: query });
  if (params?.meeting_id) searchParams.set("meeting_id", params.meeting_id);
  if (params?.limit) searchParams.set("limit", String(params.limit));

  return fetchJson(`/api/search?${searchParams.toString()}`);
}

// Helper to extract YouTube video ID from URL
export function getYouTubeVideoId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
  );
  return match ? match[1] : null;
}

// Format seconds to MM:SS or H:MM:SS
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Format duration in seconds to human readable (e.g., "3m 33s")
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

// Format date to readable string
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
