"use client";

import { ArrowLeft } from "lucide-react";
import type { Thought, FeelingId, Reaction } from "@/lib/types";
import { feelingOf, feelingWash } from "@/lib/feelings";
import FeedCard, { type ReportReason } from "@/components/Feed/FeedCard";

interface FeelingRoomProps {
  feelingId: FeelingId;
  thoughts: Thought[];
  onCreate: () => void;
  onBack: () => void;
  onReact?: (thoughtId: string, reaction: Reaction) => void;
  onReport?: (thoughtId: string, reason: ReportReason) => void | Promise<boolean>;
  onDelete?: (thoughtId: string) => void;
  onOpenRoom?: (id: FeelingId) => void;
  onFeelWith?: (handle: string, next: boolean) => void;
  followingHandles?: Set<string> | string[];
  othersMap?: Record<string, number>;
  currentHandle?: string | null;
  currentAuthor?: string | null;
}

function norm(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

export default function FeelingRoom({
  feelingId,
  thoughts,
  onCreate,
  onBack,
  onReact,
  onReport,
  onDelete,
  onOpenRoom,
  onFeelWith,
  followingHandles,
  othersMap,
  currentHandle,
  currentAuthor,
}: FeelingRoomProps) {
  const meta = feelingOf(feelingId)!;
  const roomThoughts = thoughts.filter((t) => (t.feeling ?? "") === feelingId);
  const following = new Set(
    (Array.isArray(followingHandles)
      ? followingHandles
      : followingHandles
        ? Array.from(followingHandles)
        : []
    ).map(norm)
  );

  return (
    <div className={`flex-1 ${feelingWash(feelingId)}`}>
      <div className="sticky top-0 z-20 border-b border-[var(--border-base)] bg-[var(--surface)]/95 backdrop-blur-sm app-pad py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Feeling room
            </p>
            <h2 className="font-display text-xl font-medium text-[var(--foreground)]">
              {meta.short}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {meta.label} · {roomThoughts.length} voice
              {roomThoughts.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 w-full rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
        >
          Share this feeling
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
              onReport={onReport}
              onDelete={onDelete}
              onOpenRoom={onOpenRoom}
              onFeelWith={onFeelWith}
              feelingWith={following.has(norm(t.handle))}
              currentHandle={currentHandle}
              currentAuthor={currentAuthor}
              others={t.feeling ? othersMap?.[t.feeling] : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
