"use client";

interface ChunkSummaryProps {
  summary: string;
  onQuoteClick?: (timestamp: number) => void;
}

export function ChunkSummary({ summary }: ChunkSummaryProps) {
  return (
    <section aria-labelledby="summary-heading" className="space-y-4">
      <h2
        id="summary-heading"
        className="text-lg font-semibold text-foreground"
      >
        Summary
      </h2>
      <p className="text-muted-foreground leading-relaxed text-[15px] max-w-prose">
        {summary}
      </p>
    </section>
  );
}
