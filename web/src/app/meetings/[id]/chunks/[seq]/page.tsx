import {
  getMeeting,
  getMeetings,
  getChunkBySequence,
} from "@/lib/api";
import { ChunkPageContent } from "@/components/ChunkPageContent";

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

  // Find prev/next chunks
  const currentIndex = meeting.chunks.findIndex(
    (c) => c.sequence_number === sequenceNumber
  );
  const prevChunk = currentIndex > 0 ? meeting.chunks[currentIndex - 1] : undefined;
  const nextChunk =
    currentIndex < meeting.chunks.length - 1
      ? meeting.chunks[currentIndex + 1]
      : undefined;

  return (
    <ChunkPageContent
      chunk={chunk}
      meeting={meeting}
      prevChunk={prevChunk}
      nextChunk={nextChunk}
      currentIndex={currentIndex + 1}
      totalChunks={meeting.chunks.length}
    />
  );
}
