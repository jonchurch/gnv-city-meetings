import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Chunk } from "@/lib/types";

interface ChunkNavProps {
  meetingId: string;
  prevChunk?: Chunk;
  nextChunk?: Chunk;
}

export function ChunkNav({ meetingId, prevChunk, nextChunk }: ChunkNavProps) {
  return (
    <nav
      className="grid grid-cols-2 gap-3"
      aria-label="Chunk navigation"
    >
      {prevChunk ? (
        <Link
          href={`/meetings/${meetingId}/chunks/${prevChunk.sequence_number}`}
          className="group flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:border-border hover:bg-muted/50 transition-all"
        >
          <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground mb-0.5">Previous</div>
            <div className="text-sm font-medium text-foreground truncate">
              {prevChunk.title}
            </div>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {nextChunk ? (
        <Link
          href={`/meetings/${meetingId}/chunks/${nextChunk.sequence_number}`}
          className="group flex items-center justify-end gap-3 p-4 rounded-xl border border-border/50 bg-card hover:border-border hover:bg-muted/50 transition-all text-right"
        >
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground mb-0.5">Next</div>
            <div className="text-sm font-medium text-foreground truncate">
              {nextChunk.title}
            </div>
          </div>
          <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}
