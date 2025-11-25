interface YouTubeEmbedProps {
  videoId: string;
  startTime?: number;
  title?: string;
}

export function YouTubeEmbed({ videoId, startTime = 0, title }: YouTubeEmbedProps) {
  const startSeconds = Math.floor(startTime);
  const src = `https://www.youtube.com/embed/${videoId}?start=${startSeconds}&cc_load_policy=1&rel=0`;

  return (
    <div className="aspect-video w-full">
      <iframe
        width="100%"
        height="100%"
        src={src}
        title={title || "YouTube video"}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="rounded-lg"
      />
    </div>
  );
}
