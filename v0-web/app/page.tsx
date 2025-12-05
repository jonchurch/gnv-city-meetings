import Link from "next/link"
import { mockMeeting, mockChunk } from "@/lib/mock-data"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Gainesville Meeting Minutes</h1>
        <p className="text-muted-foreground mb-8">Searchable transcripts and summaries of city government meetings</p>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Demo: View a Chunk</h2>
          <p className="text-muted-foreground mb-4">
            This demo shows the Chunk Page for the &quot;{mockChunk.title}&quot; segment from the {mockMeeting.title}.
          </p>
          <Link
            href={`/meetings/${mockMeeting.id}/chunks/${mockChunk.id}`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View Chunk Page →
          </Link>
        </div>
      </div>
    </main>
  )
}
