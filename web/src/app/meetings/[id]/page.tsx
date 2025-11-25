import { getMeeting, getMeetings, formatDate, getYouTubeVideoId } from "@/lib/api";
import { ChapterCard } from "@/components/ChapterCard";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  const { data: meetings } = await getMeetings({ limit: 100 });
  return meetings.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const meeting = await getMeeting(id);
  return {
    title: `${meeting.title} | Gainesville City Meetings`,
    description: `${meeting.title} - ${formatDate(meeting.date)}`,
  };
}

export default async function MeetingPage({ params }: Props) {
  const { id } = await params;
  const meeting = await getMeeting(id);
  const videoId = getYouTubeVideoId(meeting.youtube_url);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; All Meetings
        </Link>
        <h1 className="text-3xl font-bold mt-2">{meeting.title}</h1>
        <p className="text-muted-foreground mt-1">{formatDate(meeting.date)}</p>
      </div>

      {videoId && (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Full Meeting Video</h2>
          <a
            href={meeting.youtube_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-xl"
          >
            <img
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt="Watch on YouTube"
              className="rounded-lg hover:opacity-90 transition-opacity"
            />
          </a>
          <a
            href={meeting.youtube_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Watch on YouTube &rarr;
          </a>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          Chapters ({meeting.chunks.length})
        </h2>
        <div className="grid gap-4">
          {meeting.chunks.map((chunk) => (
            <ChapterCard key={chunk.id} chunk={chunk} meetingId={meeting.id} />
          ))}
        </div>
      </div>
    </div>
  );
}
