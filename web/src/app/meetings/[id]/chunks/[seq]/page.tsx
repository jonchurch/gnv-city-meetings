import {
  getMeeting,
  getMeetings,
  getChunkBySequence,
  formatTime,
  formatDuration,
  getYouTubeVideoId,
} from "@/lib/api";
import { ChunkNavigation } from "@/components/ChunkNavigation";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import { TypeBadge } from "@/components/TypeBadge";
import { Transcript } from "@/components/Transcript";

interface Props {
  params: Promise<{ id: string; seq: string }>;
}

export async function generateStaticParams() {
  const { data: meetings } = await getMeetings({ limit: 100 });
  const params: { id: string; seq: string }[] = [];

  for (const meeting of meetings) {
    const detail = await getMeeting(meeting.id);
    for (const chunk of detail.chunks) {
      params.push({
        id: meeting.id,
        seq: String(chunk.sequence_number),
      });
    }
  }

  return params;
}

export async function generateMetadata({ params }: Props) {
  const { id, seq } = await params;
  const chunk = await getChunkBySequence(id, parseInt(seq, 10));
  const meeting = await getMeeting(id);

  return {
    title: `${chunk.title} | ${meeting.title} | Gainesville City Meetings`,
    description: chunk.summary.slice(0, 160),
  };
}

export default async function ChunkPage({ params }: Props) {
  const { id, seq } = await params;
  const sequenceNumber = parseInt(seq, 10);
  const [chunk, meeting] = await Promise.all([
    getChunkBySequence(id, sequenceNumber),
    getMeeting(id),
  ]);

  const videoId = getYouTubeVideoId(meeting.youtube_url);
  const duration = chunk.end_time - chunk.start_time;

  return (
    <div className="space-y-6 max-w-4xl">
      <ChunkNavigation
        meetingId={id}
        currentSequence={sequenceNumber}
        totalChunks={meeting.chunks.length}
      />

      <div>
        <h1 className="text-2xl font-bold">{chunk.title}</h1>
        <div className="flex items-center gap-3 mt-2 text-muted-foreground">
          <span>{formatTime(chunk.start_time)}</span>
          <span>&middot;</span>
          <span>{formatDuration(duration)}</span>
          <span>&middot;</span>
          <span>{meeting.title}</span>
          <TypeBadge type={chunk.chunk_type} />
        </div>
      </div>

      {videoId && (
        <YouTubeEmbed
          videoId={videoId}
          startTime={chunk.start_time}
          title={chunk.title}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Summary</h2>
        <p className="text-muted-foreground leading-relaxed">{chunk.summary}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Transcript</h2>
        <Transcript lines={chunk.transcript_lines} />
      </section>

      <ChunkNavigation
        meetingId={id}
        currentSequence={sequenceNumber}
        totalChunks={meeting.chunks.length}
      />
    </div>
  );
}
