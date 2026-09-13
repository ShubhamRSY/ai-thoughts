"use client";

import { Flame, Heart } from "lucide-react";
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
              <Heart className="h-3.5 w-3.5 text-[var(--accent)]" fill="currentColor" />
              How AI feels today
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
              ? "You’re checked in. Feel with someone while the thread is warm."
              : "Pick a feeling first — then share an honest take."}
          </p>
          {todayAnswerCount > 0 && onBrowseToday && (
            <button
              type="button"
              onClick={onBrowseToday}
              className="mt-2 text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              See how {todayAnswerCount} other{todayAnswerCount === 1 ? "" : "s"} feel →
            </button>
          )}
        </div>

        <div className="px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            I feel…
          </p>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {FEELINGS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onShare(f.id)}
                className={`shrink-0 rounded-full border px-3 py-2 text-left transition hover:opacity-90 ${f.chip}`}
              >
                <span className="block text-xs font-semibold">{f.short}</span>
                <span className="mt-0.5 block max-w-[9.5rem] truncate text-[10px] opacity-80">
                  {f.label}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onShare()}
            className="mt-3 w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
          >
            {checkedInToday ? "Share another take" : "Share your take"}
          </button>
        </div>
      </div>
    </section>
  );
}
