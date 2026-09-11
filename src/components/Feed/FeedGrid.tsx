"use client";

import type { Thought, Reaction, FeelingId } from "@/lib/types";
import FeedCard, { type ReportReason } from "@/components/Feed/FeedCard";

interface FeedGridProps {
  thoughts: Thought[];
  onReact?: (thoughtId: string, reaction: Reaction) => void;
  onReport?: (thoughtId: string, reason: ReportReason) => void;
  onOpenRoom?: (id: FeelingId) => void;
  othersMap?: Record<string, number>;
}

export default function FeedGrid({
  thoughts,
  onReact,
  onReport,
  onOpenRoom,
  othersMap,
}: FeedGridProps) {
  if (thoughts.length === 0) {
    return (
      <div className="px-1 py-16 text-center">
        <p className="font-display text-lg text-[var(--foreground)]">Quiet for now.</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Be the first to say how AI makes you feel.
        </p>
      </div>
    );
  }

  return (
    <div className="feed-grid">
      {thoughts.map((t) => (
        <FeedCard
          key={t.id}
          thought={t}
          onReact={onReact}
          onReport={onReport}
          onOpenRoom={onOpenRoom}
          others={t.feeling ? othersMap?.[t.feeling] : undefined}
        />
      ))}
    </div>
  );
}
