"use client";

import { ArrowLeft } from "lucide-react";
import type { Thought, FeelingId, Reaction } from "@/lib/types";
import { feelingOf } from "@/lib/feelings";
import FeedCard from "@/components/Feed/FeedCard";

interface FeelingRoomProps {
  feelingId: FeelingId;
  thoughts: Thought[];
  onCreate: () => void;
  onBack: () => void;
  onReact?: (thoughtId: string, reaction: Reaction) => void;
  onDelete?: (thoughtId: string) => void;
  currentHandle?: string | null;
}

export default function FeelingRoom({
  feelingId,
  thoughts,
  onCreate,
  onBack,
  onReact,
  onDelete,
  currentHandle,
}: FeelingRoomProps) {
  const meta = feelingOf(feelingId)!;
  const roomThoughts = thoughts.filter((t) => (t.feeling ?? "") === feelingId);

  return (
    <div className="flex-1">
      <div className="sticky top-0 z-20 border-b border-[var(--border-base)] bg-[var(--surface)] app-pad py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-medium text-[var(--foreground)]">
              {meta.short}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              {roomThoughts.length} voice{roomThoughts.length === 1 ? "" : "s"} · {meta.label}
            </p>
          </div>
        </div>
        <button
          onClick={onCreate}
          className="mt-4 w-full rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
        >
          Share in this room
        </button>
      </div>

      <div className="app-pad pb-6">
        {roomThoughts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-display text-lg text-[var(--foreground)]">This room is new.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Be the first to say you feel {meta.short.toLowerCase()}.
            </p>
          </div>
        ) : (
          roomThoughts.map((t) => (
            <FeedCard
              key={t.id}
              thought={t}
              onReact={onReact}
              onDelete={onDelete}
              currentHandle={currentHandle}
            />
          ))
        )}
      </div>
    </div>
  );
}
