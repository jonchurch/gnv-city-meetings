"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { MeetingWithChunks } from "@/lib/types";

interface MeetingTocSidebarProps {
  meeting: MeetingWithChunks;
  currentSequence: number;
}

export function MeetingTocSidebar({
  meeting,
  currentSequence,
}: MeetingTocSidebarProps) {
  const activeItemRef = useRef<HTMLAnchorElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Auto-scroll to active item on mount
  useEffect(() => {
    if (activeItemRef.current && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect();
      const itemRect = activeItemRef.current.getBoundingClientRect();
      const offset =
        itemRect.top - navRect.top - navRect.height / 2 + itemRect.height / 2;
      navRef.current.scrollTop = offset;
    }
  }, [currentSequence]);

  return (
    <nav
      ref={navRef}
      className={cn(
        "fixed left-6 top-1/2 -translate-y-1/2 z-20",
        "max-h-[60vh] overflow-y-auto overflow-x-hidden",
        "w-56",
        "scrollbar-none",
        "opacity-45 hover:opacity-100",
        "transition-opacity duration-300 ease-out"
      )}
    >
      <div className="space-y-1 py-2">
        {meeting.chunks.map((chunk) => {
          const isActive = chunk.sequence_number === currentSequence;
          return (
            <Link
              key={chunk.id}
              ref={isActive ? activeItemRef : undefined}
              href={`/meetings/${meeting.id}/chunks/${chunk.sequence_number}`}
              className={cn(
                "block text-xs leading-snug py-1 px-2 rounded",
                "transition-all duration-300",
                isActive
                  ? "text-foreground font-medium bg-muted"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {chunk.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
