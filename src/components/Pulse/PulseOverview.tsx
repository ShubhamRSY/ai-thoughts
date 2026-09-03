"use client";

import type { Thought, FeelingId } from "@/lib/types";
import { FEELINGS, feelingOf } from "@/lib/feelings";

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
    <div className="mt-4 flex items-center gap-3 px-4">
      {/* Dominant feeling chip */}
      {dominantMeta ? (
        <button
          onClick={() => dominant && onOpenRoom(dominant.id)}
          className="flex shrink-0 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 transition hover:border-zinc-700 active:scale-95"
        >
          <span className="text-base leading-none">{dominantMeta.emoji}</span>
          <div className="flex flex-col items-start leading-none">
            <span className="text-xs font-semibold text-zinc-100">
              {dominantMeta.short} right now
            </span>
            <span className="mt-0.5 text-[10px] text-zinc-500">
              {total} voice{total === 1 ? "" : "s"}
            </span>
          </div>
        </button>
      ) : (
        <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs font-semibold text-zinc-400">
          The pulse is warming up
        </span>
      )}

      {/* Slim wave */}
      <div className="flex h-8 min-w-0 flex-1 items-end gap-[3px]">
        {FEELINGS.map((f) => {
          const count = tally.find((t) => t.id === f.id)?.count ?? 0;
          const amp = count > 0 ? 0.35 + 0.65 * (count / max) : 0.08;
          return (
            <button
              key={f.id}
              onClick={() => onOpenRoom(f.id)}
              aria-label={`${f.short}: ${count}`}
              className={`min-w-0 flex-1 rounded-full transition-all duration-500 ${
                count > 0
                  ? activeId === f.id
                    ? "bg-gradient-to-t from-violet-600 to-indigo-400"
                    : "bg-zinc-600"
                  : "bg-zinc-800"
              }`}
              style={{ height: `${Math.max(18, amp * 100)}%`, alignSelf: "flex-end" }}
            />
          );
        })}
      </div>
    </div>
  );
}
