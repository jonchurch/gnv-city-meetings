"use client";

import { useState } from "react";
import { search, formatTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { SearchResult } from "@/lib/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setHasSearched(true);
    try {
      const response = await search(query, { limit: 50 });
      setResults(response.data);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Search Transcripts</h1>
        <p className="text-muted-foreground mt-2">
          Search across all meeting transcripts
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search transcripts..."
          className="flex-1 px-4 py-2 border rounded-lg bg-background"
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Searching..." : "Search"}
        </Button>
      </form>

      {hasSearched && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {results.length} result{results.length !== 1 ? "s" : ""} found
          </p>

          {results.map((result) => (
            <Link
              key={result.id}
              href={`/meetings/${result.meeting_id}/chunks/${result.chunk_id.split("_chunk_")[1]}`}
              className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <p className="text-sm text-muted-foreground mb-1">
                {result.whisperx_speaker_label} at {formatTime(result.start_time)}
              </p>
              <p>{result.text}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
