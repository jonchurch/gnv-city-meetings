import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ChunkPageContent } from "@/components/chunk-page-content"
import { getChunkById, getMeetingById, getAdjacentChunks, getChunkPosition } from "@/lib/mock-data"

interface ChunkPageProps {
  params: Promise<{
    meetingId: string
    chunkId: string
  }>
}

export async function generateMetadata({ params }: ChunkPageProps): Promise<Metadata> {
  const { meetingId, chunkId } = await params
  const meeting = getMeetingById(meetingId)
  const chunk = getChunkById(chunkId)

  if (!meeting || !chunk) {
    return {
      title: "Chunk Not Found",
    }
  }

  return {
    title: `${chunk.title} | ${meeting.title} | Gainesville Meeting Minutes`,
    description: chunk.summary,
    openGraph: {
      title: chunk.title,
      description: chunk.summary,
      type: "article",
    },
  }
}

export default async function ChunkPage({ params }: ChunkPageProps) {
  const { meetingId, chunkId } = await params
  const meeting = getMeetingById(meetingId)
  const chunk = getChunkById(chunkId)

  if (!meeting || !chunk) {
    notFound()
  }

  const { prev, next } = getAdjacentChunks(meetingId, chunkId)
  const { currentIndex, totalChunks } = getChunkPosition(meetingId, chunkId)

  return (
    <ChunkPageContent
      chunk={chunk}
      meeting={meeting}
      prevChunk={prev}
      nextChunk={next}
      currentIndex={currentIndex}
      totalChunks={totalChunks}
    />
  )
}
