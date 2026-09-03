"use client";

import type { Thought, Reaction, FeelingId } from "@/lib/types";
import FeedCard, { type ReportReason } from "@/components/Feed/FeedCard";

interface FeedGridProps {
  thoughts: Thought[];
  onReact?: (thoughtId: string, reaction: Reaction) => void;
  onReport?: (thoughtId: string, reason: ReportReason) => void;
  onOpenRoom?: (id: FeelingId) => void;
  /** feeling id -> number of takes sharing it (for the "you're not alone" chip). */
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
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
        <div className="animate-floaty text-5xl">🫶</div>
        <p className="text-sm font-medium text-zinc-300">The pulse is quiet right now.</p>
        <p className="max-w-xs text-xs text-zinc-500">
          Be the first to share how you really feel about AI — no matter your age or language.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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