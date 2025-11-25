import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ChunkNavigationProps {
  meetingId: string;
  currentSequence: number;
  totalChunks: number;
}

export function ChunkNavigation({
  meetingId,
  currentSequence,
  totalChunks,
}: ChunkNavigationProps) {
  const hasPrev = currentSequence > 1;
  const hasNext = currentSequence < totalChunks;

  return (
    <nav className="flex items-center justify-between gap-4 flex-wrap">
      <Link href={`/meetings/${meetingId}`}>
        <Button variant="ghost" size="sm">
          &larr; Back to Meeting
        </Button>
      </Link>

      <div className="flex gap-2">
        {hasPrev ? (
          <Link href={`/meetings/${meetingId}/chunks/${currentSequence - 1}`}>
            <Button variant="outline" size="sm">
              &larr; Previous
            </Button>
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            &larr; Previous
          </Button>
        )}

        <span className="flex items-center px-3 text-sm text-muted-foreground">
          {currentSequence} / {totalChunks}
        </span>

        {hasNext ? (
          <Link href={`/meetings/${meetingId}/chunks/${currentSequence + 1}`}>
            <Button variant="outline" size="sm">
              Next &rarr;
            </Button>
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next &rarr;
          </Button>
        )}
      </div>
    </nav>
  );
}
