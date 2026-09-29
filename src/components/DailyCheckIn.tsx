"use client";

import { Flame, Heart } from "lucide-react";
import { dailyPrompt, weeklyTheme } from "@/lib/daily-prompt";
import { BRAND } from "@/lib/brand";

interface DailyCheckInProps {
  streakCount: number;
  checkedInToday: boolean;
  todayAnswerCount?: number;
  onShare: () => void;
  onBrowseToday?: () => void;
}

export default function DailyCheckIn({
  streakCount,
  checkedInToday,
  todayAnswerCount = 0,
  onShare,
  onBrowseToday,
}: DailyCheckInProps) {
  const prompt = dailyPrompt();
  const theme = weeklyTheme();

  return (
    <section className="app-pad mt-4">
      <div className="overflow-hidden rounded-2xl border border-[var(--border-base)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border-base)] bg-[var(--surface-2)]/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Heart className="h-3.5 w-3.5 text-[var(--accent)]" fill="currentColor" />
              How AI feels today
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-amber-800">
              <Flame className="h-3.5 w-3.5" fill="currentColor" />
              {streakCount || 0}
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-[var(--accent)]">This week: {theme}</p>
          <h2 className="mt-1 font-display text-xl font-medium leading-snug text-[var(--foreground)]">
            {prompt}
          </h2>
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            {checkedInToday
              ? "You’re checked in. Feel with someone while the thread is warm."
              : "Say it in your own words — love it, fear it, or both."}
          </p>
          {todayAnswerCount > 0 && onBrowseToday && (
            <button
              type="button"
              onClick={onBrowseToday}
              className="mt-2 text-xs font-semibold text-[var(--accent)] underline underline-offset-2"
            >
              See how {todayAnswerCount} other{todayAnswerCount === 1 ? "" : "s"} feel →
            </button>
          )}
        </div>

        <div className="px-4 py-3">
          <button
            type="button"
            onClick={onShare}
            className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
          >
            {BRAND.shareCta}
          </button>
        </div>
      </div>
    </section>
  );
}
