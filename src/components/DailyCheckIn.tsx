"use client";

import { Flame, Sparkles } from "lucide-react";
import { FEELINGS } from "@/lib/feelings";
import type { FeelingId } from "@/lib/types";
import { dailyPrompt } from "@/lib/daily-prompt";

interface DailyCheckInProps {
  streakCount: number;
  checkedInToday: boolean;
  todayAnswerCount?: number;
  onShare: (feeling?: FeelingId) => void;
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

  return (
    <section className="app-pad mt-4">
      <div className="overflow-hidden rounded-2xl border border-[var(--border-base)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border-base)] bg-[var(--surface-2)]/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              Today&apos;s prompt
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-amber-800">
              <Flame className="h-3.5 w-3.5" fill="currentColor" />
              {streakCount || 0}
            </span>
          </div>
          <h2 className="mt-2 font-display text-xl font-medium leading-snug text-[var(--foreground)]">
            {prompt}
          </h2>
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            {checkedInToday
              ? "You’re checked in. React to someone while the thread is warm — or share another take."
              : "One honest take a day beats scrolling forever. Peek at others first, then share."}
          </p>
          {todayAnswerCount > 0 && onBrowseToday && (
            <button
              type="button"
              onClick={onBrowseToday}
              className="mt-2 text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              See {todayAnswerCount} answer{todayAnswerCount === 1 ? "" : "s"} to today’s prompt →
            </button>
          )}
        </div>

        <div className="px-4 py-3">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {FEELINGS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onShare(f.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] ${f.chip}`}
              >
                {f.short}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onShare()}
            className="mt-3 w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
          >
            {checkedInToday ? "Share another take" : "Answer today’s prompt"}
          </button>
        </div>
      </div>
    </section>
  );
}
