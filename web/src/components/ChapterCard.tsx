import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTime, formatDuration } from "@/lib/api";
import type { Chunk } from "@/lib/types";
import { getChunkTypeLabel, getChunkTypeColor } from "@/lib/types";

interface ChapterCardProps {
  chunk: Chunk;
  meetingId: string;
}

export function ChapterCard({ chunk, meetingId }: ChapterCardProps) {
  const duration = chunk.end_time - chunk.start_time;

  return (
    <Link href={`/meetings/${meetingId}/chunks/${chunk.sequence_number}`}>
      <Card className="hover:bg-muted/50 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg leading-tight">
              {chunk.sequence_number}. {chunk.title}
            </CardTitle>
            <Badge
              variant="secondary"
              className={`${getChunkTypeColor(chunk.chunk_type)} text-xs font-medium`}
            >
              {getChunkTypeLabel(chunk.chunk_type)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatTime(chunk.start_time)} &middot; {formatDuration(duration)}
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {chunk.summary}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
