"use client";

import { ArrowLeft, Mic, Sprout } from "lucide-react";
import type { Thought, FeelingId, Reaction } from "@/lib/types";
import { feelingOf } from "@/lib/feelings";
import FeedCard from "@/components/Feed/FeedCard";

interface FeelingRoomProps {
  feelingId: FeelingId;
  thoughts: Thought[];
  onCreate: () => void;
  onBack: () => void;
  onReact?: (thoughtId: string, reaction: Reaction) => void;
}

export default function FeelingRoom({
  feelingId,
  thoughts,
  onCreate,
  onBack,
  onReact,
}: FeelingRoomProps) {
  const meta = feelingOf(feelingId)!;
  const roomThoughts = thoughts.filter((t) => (t.feeling ?? "") === feelingId);

  return (
    <div className="flex-1">
      {/* Room header */}
      <div className="sticky top-0 z-20 border-b border-[var(--border-base)]/80 bg-[var(--surface)]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back to pulse"
            className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span
            aria-hidden
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${meta.chip} text-xl`}
          >
            {meta.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display truncate text-base font-bold text-[var(--foreground)]">{meta.label}</h2>
            <p className="text-[11px] text-[var(--muted)]">
              {roomThoughts.length} voice{roomThoughts.length === 1 ? "" : "s"} feel this today
            </p>
          </div>
        </div>
        <button
          onClick={onCreate}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)]"
        >
          <Mic className="h-4 w-4" />
          Share your take in this room
        </button>
      </div>

      {/* Room feed */}
      <div className="px-4 pb-6 pt-3">
        {roomThoughts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-base)] bg-[var(--surface)] px-6 py-16 text-center">
            <span aria-hidden className="text-4xl">
              {meta.emoji}
            </span>
            <p className="text-sm font-medium text-[var(--foreground)]">This room is just starting.</p>
            <p className="max-w-xs text-xs text-[var(--muted)]">
              Be the first to say you feel {meta.short.toLowerCase()} — someone out there needs
              to hear it.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {roomThoughts.map((t) => (
              <FeedCard key={t.id} thought={t} onReact={onReact} />
            ))}
          </div>
        )}
      </div>

      {/* Room footer note */}
      <div className="px-4 pb-2">
        <p className="flex items-center gap-1.5 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--muted)]">
          <Sprout className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          Rooms grow as more people feel this way. Your voice makes it easier for others to say
          it first.
        </p>
      </div>
    </div>
  );
}
