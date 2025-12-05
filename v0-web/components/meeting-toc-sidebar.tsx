"use client"

import Link from "next/link"
import { useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import type { Meeting, Chunk, AgendaItem } from "@/lib/types"

interface MeetingTocSidebarProps {
  meeting: Meeting
  currentChunkId: string
}

export function MeetingTocSidebar({ meeting, currentChunkId }: MeetingTocSidebarProps) {
  const activeItemRef = useRef<HTMLAnchorElement>(null)
  const navRef = useRef<HTMLElement>(null)

  const currentChunk = meeting.chunks.find((c) => c.id === currentChunkId)
  const currentAgendaId = currentChunk?.agendaId

  // Get chunks for an agenda item
  const getChunksForAgenda = (agenda: AgendaItem): Chunk[] => {
    return agenda.chunkIds
      .map((id) => meeting.chunks.find((c) => c.id === id))
      .filter((c): c is Chunk => c !== undefined)
  }

  // Auto-scroll to active item on mount
  useEffect(() => {
    if (activeItemRef.current && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect()
      const itemRect = activeItemRef.current.getBoundingClientRect()
      const offset = itemRect.top - navRect.top - navRect.height / 2 + itemRect.height / 2
      navRef.current.scrollTop = offset
    }
  }, [currentChunkId])

  return (
    <nav
      ref={navRef}
      className={cn(
        "fixed left-6 top-1/2 -translate-y-1/2 z-20",
        "max-h-[60vh] overflow-y-auto overflow-x-hidden",
        "w-56",
        "scrollbar-none",
        "opacity-45 hover:opacity-100",
        "transition-opacity duration-300 ease-out",
      )}
    >
      <div className="space-y-5 py-2">
        {meeting.agenda && meeting.agenda.length > 0 ? (
          meeting.agenda.map((agenda) => {
            const chunks = getChunksForAgenda(agenda)
            const isCurrentAgenda = agenda.id === currentAgendaId

            return (
              <div key={agenda.id} className="space-y-1.5">
                <p
                  className={cn(
                    "text-[13px] font-medium leading-tight",
                    "transition-colors duration-300",
                    isCurrentAgenda ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {agenda.title}
                </p>

                <div className="space-y-1 pl-3">
                  {chunks.map((c) => {
                    const isActive = c.id === currentChunkId
                    return (
                      <Link
                        key={c.id}
                        ref={isActive ? activeItemRef : undefined}
                        href={`/meetings/${meeting.id}/chunks/${c.id}`}
                        className={cn(
                          "block text-xs leading-snug py-0.5",
                          "transition-all duration-300",
                          isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {c.title}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })
        ) : (
          // Flat list fallback
          <div className="space-y-1">
            {meeting.chunks.map((c) => {
              const isActive = c.id === currentChunkId
              return (
                <Link
                  key={c.id}
                  ref={isActive ? activeItemRef : undefined}
                  href={`/meetings/${meeting.id}/chunks/${c.id}`}
                  className={cn(
                    "block text-xs leading-snug py-0.5",
                    "transition-all duration-300",
                    isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.title}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </nav>
  )
}
