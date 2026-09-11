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
    <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border-base)] bg-[var(--surface)]">
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50">
          <Flame className="h-6 w-6 text-amber-600" fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold tabular-nums text-[var(--foreground)]">
              {count}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              day{count === 1 ? "" : "s"} sharing
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            {checkedInToday
              ? "You shared a take today."
              : "Share a take today to keep your streak."}
          </p>
        </div>
        {checkedInToday && f && (
          <span
            aria-hidden
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-lg ${f.chip}`}
            title="Today"
          >
            {f.emoji || "·"}
          </span>
        )}
      </div>

      {!checkedInToday && (
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--border-base)] px-4 py-2.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-50"
        >
          <CalendarHeart className="h-4 w-4" />
          Check in today — share a take
        </button>
      )}
    </div>
  );
}
