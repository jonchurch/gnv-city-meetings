import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/api";
import type { Meeting } from "@/lib/types";

interface MeetingCardProps {
  meeting: Meeting;
}

export function MeetingCard({ meeting }: MeetingCardProps) {
  return (
    <Link href={`/meetings/${meeting.id}`}>
      <Card className="hover:bg-muted/50 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-xl">{meeting.title}</CardTitle>
            <Badge variant="outline">{meeting.processing_status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{formatDate(meeting.date)}</p>
          {meeting.meeting_type && meeting.meeting_type !== meeting.title && (
            <p className="text-sm text-muted-foreground mt-1">
              {meeting.meeting_type}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
