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
    <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border-base)] bg-white shadow-sm shadow-slate-900/5">
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-2xl">
          <Flame className="h-6 w-6 text-amber-600" fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold tabular-nums text-[var(--foreground)]">{count}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              day{count === 1 ? "" : "s"} on the pulse
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            {checkedInToday
              ? "Your voice is on today's pulse."
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
          className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--border-base)] px-4 py-2.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
        >
          <CalendarHeart className="h-4 w-4" />
          Check in today — send how you feel
        </button>
      )}
    </div>
  );
}
