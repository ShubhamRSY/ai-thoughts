"use client";

import { Flame, CalendarHeart } from "lucide-react";
import type { FeelingId } from "@/lib/types";
import { feelingOf } from "@/lib/feelings";

interface StreakCardProps {
  count: number;
  todayFeeling?: FeelingId;
  checkedInToday: boolean;
  onCreate: () => void;
}

export default function StreakCard({
  count,
  todayFeeling,
  checkedInToday,
  onCreate,
}: StreakCardProps) {
  const f = feelingOf(todayFeeling);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-orange-950/40 via-zinc-900/50 to-zinc-950/60">
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/25 to-orange-500/20 text-2xl">
          <Flame className="h-6 w-6 text-amber-400" fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-zinc-50">{count}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              day{count === 1 ? "" : "s"} on the pulse
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {checkedInToday
              ? "Your voice is on today's pulse. 💜"
              : "Post a take today to keep your pulse alive."}
          </p>
        </div>
        {checkedInToday && f && (
          <span
            aria-hidden
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${f.chip} text-lg`}
            title="How you feel today"
          >
            {f.emoji}
          </span>
        )}
      </div>

      {!checkedInToday && (
        <button
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-1.5 border-t border-zinc-800/70 px-4 py-2.5 text-xs font-semibold text-amber-300/90 transition hover:bg-amber-500/5"
        >
          <CalendarHeart className="h-4 w-4" />
          Check in today — send how you feel
        </button>
      )}
    </div>
  );
}