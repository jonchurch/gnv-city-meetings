"use client"

import type { ChunkSummary as ChunkSummaryType } from "@/lib/types"
import { formatTimestamp } from "@/lib/types"
import { CheckCircle2, Quote, Play } from "lucide-react"

interface ChunkSummaryProps {
  summary: string | ChunkSummaryType
  onQuoteClick?: (timestamp: number) => void
}

export function ChunkSummary({ summary, onQuoteClick }: ChunkSummaryProps) {
  // Handle simple string summary
  if (typeof summary === "string") {
    return (
      <section aria-labelledby="summary-heading" className="space-y-4">
        <h2 id="summary-heading" className="text-lg font-semibold text-foreground">
          Summary
        </h2>
        <p className="text-muted-foreground leading-relaxed text-[15px] max-w-prose">{summary}</p>
      </section>
    )
  }

  // Structured summary with key decisions and quotes
  return (
    <section aria-labelledby="summary-heading" className="space-y-6">
      {/* Main summary text */}
      <div>
        <h2 id="summary-heading" className="text-lg font-semibold text-foreground mb-3">
          Summary
        </h2>
        <p className="text-muted-foreground leading-relaxed text-[16px] max-w-prose">{summary.text}</p>
      </div>

      {/* Key decisions */}
      {summary.keyDecisions && summary.keyDecisions.length > 0 && (
        <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-5 max-w-2xl">
          <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Key Decisions & Outcomes
          </h3>
          <ul className="space-y-2">
            {summary.keyDecisions.map((decision, i) => (
              <li key={i} className="text-[15px] text-foreground/90 flex items-start gap-2">
                <span className="text-emerald-500 mt-1.5">•</span>
                {decision}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notable quotes */}
      {summary.notableQuotes && summary.notableQuotes.length > 0 && (
        <div className="space-y-3 max-w-2xl">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Quote className="h-4 w-4" />
            Notable Quotes
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.notableQuotes.map((item, i) => {
              const hasTimestamp = item.timestamp !== undefined && onQuoteClick

              return (
                <blockquote
                  key={i}
                  className={`rounded-lg bg-muted/50 border border-border/50 p-4 text-sm transition-colors ${
                    hasTimestamp ? "cursor-pointer hover:bg-muted hover:border-border" : ""
                  }`}
                  onClick={hasTimestamp ? () => onQuoteClick(item.timestamp!) : undefined}
                  role={hasTimestamp ? "button" : undefined}
                  tabIndex={hasTimestamp ? 0 : undefined}
                  onKeyDown={
                    hasTimestamp
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onQuoteClick(item.timestamp!)
                          }
                        }
                      : undefined
                  }
                >
                  <p className="text-foreground/90 italic leading-relaxed mb-2">"{item.quote}"</p>
                  <footer className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">— {item.speaker}</span>
                    {hasTimestamp && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground/60 group-hover:text-muted-foreground">
                        <Play className="h-3 w-3 fill-current" />
                        {formatTimestamp(item.timestamp!)}
                      </span>
                    )}
                  </footer>
                </blockquote>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
