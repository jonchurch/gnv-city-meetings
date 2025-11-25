import { getMeetings } from "@/lib/api";
import { MeetingCard } from "@/components/MeetingCard";

export default async function HomePage() {
  const { data: meetings } = await getMeetings({ limit: 50 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">City Meetings</h1>
        <p className="text-muted-foreground mt-2">
          Browse meeting transcripts and video from Gainesville city government
        </p>
      </div>

      {meetings.length === 0 ? (
        <p className="text-muted-foreground">No meetings available.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </div>
      )}
    </div>
  );
}
