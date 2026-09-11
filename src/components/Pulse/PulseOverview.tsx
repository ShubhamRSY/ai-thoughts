"use client";

import type { Thought, FeelingId } from "@/lib/types";
import { FEELINGS, feelingOf } from "@/lib/feelings";

const BAR_COLOR: Record<FeelingId, string> = {
  "using-it": "bg-gradient-to-t from-sky-500 to-sky-300",
  "love-it": "bg-gradient-to-t from-teal-600 to-teal-400",
  "blown-away": "bg-gradient-to-t from-amber-500 to-amber-300",
  hurts: "bg-gradient-to-t from-rose-500 to-rose-300",
  worried: "bg-gradient-to-t from-orange-500 to-orange-300",
  confused: "bg-gradient-to-t from-slate-400 to-slate-300",
  "need-support": "bg-gradient-to-t from-emerald-600 to-emerald-400",
};

export interface FeelingTally {
  id: FeelingId;
  count: number;
}

interface PulseOverviewProps {
  thoughts: Thought[];
  tally: FeelingTally[];
  activeId: FeelingId | null;
  onOpenRoom: (id: FeelingId) => void;
}

export default function PulseOverview({
  thoughts,
  tally,
  activeId,
  onOpenRoom,
}: PulseOverviewProps) {
  const total = thoughts.length;
  const max = Math.max(1, ...tally.map((t) => t.count));
  const dominant = tally[0];
  const dominantMeta = dominant ? feelingOf(dominant.id) : undefined;

  return (
    <div className="mt-4 flex items-center gap-3 px-[var(--shell-pad)]">
      {/* Dominant feeling chip */}
      {dominantMeta ? (
        <button
          onClick={() => dominant && onOpenRoom(dominant.id)}
          className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--border-base)] bg-white px-3 py-1.5 shadow-sm shadow-slate-900/5 transition hover:border-teal-200 active:scale-95"
        >
          <span className="text-base leading-none">{dominantMeta.emoji}</span>
          <div className="flex flex-col items-start leading-none">
            <span className="text-xs font-semibold text-[var(--foreground)]">
              {dominantMeta.short} right now
            </span>
            <span className="mt-0.5 text-[10px] text-[var(--muted)]">
              {total} voice{total === 1 ? "" : "s"}
            </span>
          </div>
        </button>
      ) : (
        <span className="shrink-0 rounded-full border border-[var(--border-base)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
          The pulse is warming up
        </span>
      )}

      {/* Slim wave */}
      <div className="flex min-w-0 flex-1 items-end gap-1.5">
        {FEELINGS.map((f) => {
          const count = tally.find((t) => t.id === f.id)?.count ?? 0;
          const amp = count > 0 ? 0.35 + 0.65 * (count / max) : 0.08;
          return (
            <button
              key={f.id}
              onClick={() => onOpenRoom(f.id)}
              aria-label={`${f.short}: ${count}`}
              title={`${f.short}: ${count}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <div className="flex h-8 w-full items-end">
                <div
                  className={`w-full rounded-full transition-all duration-500 ${
                    count > 0
                      ? activeId === f.id
                        ? "bg-[var(--accent)]"
                        : BAR_COLOR[f.id]
                      : "bg-[var(--border-base)]"
                  }`}
                  style={{ height: `${Math.max(18, amp * 100)}%` }}
                />
              </div>
              <span className={`text-[11px] leading-none text-[var(--muted)] ${count > 0 ? "opacity-100" : "opacity-30"}`}>
                {f.emoji}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
