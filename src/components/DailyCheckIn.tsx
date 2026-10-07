"use client";

import { useState } from "react";
import { Flame, Heart, Mic } from "lucide-react";
import { dailyPrompt, weeklyTheme } from "@/lib/daily-prompt";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { checkContentQuality } from "@/lib/anti-abuse";
import type { FeelingId, PublishResult } from "@/lib/types";

const MAX_CHARS = 500;

interface DailyCheckInProps {
  streakCount: number;
  checkedInToday: boolean;
  todayAnswerCount?: number;
  /** How many of today's prompt answers picked each feeling (yours included once posted). */
  todayFeelings?: Record<string, number>;
  /** Post a text answer to today's prompt straight from the card. */
  onQuickPost: (content: string, feeling?: FeelingId) => Promise<PublishResult>;
  /** Full composer — audio, video, photo, tags. */
  onShare: () => void;
  onBrowseToday?: () => void;
}

function errorFor(result: Exclude<PublishResult, { ok: true }>): string {
  switch (result.reason) {
    case "cooldown":
      return `You just shared — wait ${result.retryInSec}s, then try again.`;
    case "too_long":
      return `A little long — keep it under ${result.max} characters.`;
    case "auth":
      return "Sign in to share your feeling.";
    case "blocked":
      return result.message;
    default:
      return "Couldn’t share right now. Try again in a moment.";
  }
}

export default function DailyCheckIn({
  streakCount,
  checkedInToday,
  todayAnswerCount = 0,
  todayFeelings = {},
  onQuickPost,
  onShare,
  onBrowseToday,
}: DailyCheckInProps) {
  const prompt = dailyPrompt();
  const theme = weeklyTheme();
  const [text, setText] = useState("");
  const [feeling, setFeeling] = useState<FeelingId | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Feeling of the answer just posted from here — drives the "You + N%" result. */
  const [posted, setPosted] = useState<FeelingId | "none" | null>(null);

  const submit = async () => {
    const content = text.trim();
    if (!content || busy) return;
    const quality = checkContentQuality(content, { newAccount: false });
    if (!quality.ok) return setError(quality.reason);
    setBusy(true);
    setError(null);
    const result = await onQuickPost(content, feeling).catch(
      (): PublishResult => ({ ok: false, reason: "failed" })
    );
    setBusy(false);
    if (!result.ok) return setError(errorFor(result));
    setText("");
    setPosted(feeling ?? "none");
    setFeeling(undefined);
  };

  const result = (() => {
    if (!posted) return null;
    if (posted === "none") return "Shared. See how everyone else answered →";
    const total = Object.values(todayFeelings).reduce((a, b) => a + b, 0);
    const others = total - 1;
    const label = feelingOf(posted)?.short ?? "the same";
    if (others <= 0) return `You’re the first to answer today. Check back — people are coming.`;
    const same = Math.max(0, (todayFeelings[posted] ?? 1) - 1);
    const pct = Math.round((same / others) * 100);
    return `You + ${pct}% of today’s voices feel ${label}.`;
  })();

  return (
    <section className="app-pad mt-4">
      <div className="overflow-hidden rounded-2xl border border-[var(--border-base)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border-base)] bg-[var(--surface-2)]/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Heart className="h-3.5 w-3.5 text-[var(--accent)]" fill="currentColor" />
              How AI feels today
            </p>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-amber-800"
              title={`${streakCount || 0}-day streak`}
            >
              <Flame className="h-3.5 w-3.5" fill="currentColor" />
              {streakCount || 0}
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-[var(--accent)]">This week: {theme}</p>
          <h2 className="mt-1 font-display text-xl font-medium leading-snug text-[var(--foreground)]">
            {prompt}
          </h2>
          {todayAnswerCount > 0 && onBrowseToday && !posted && (
            <button
              type="button"
              onClick={onBrowseToday}
              className="mt-2 text-xs font-semibold text-[var(--accent)] underline underline-offset-2"
            >
              See how {todayAnswerCount} other{todayAnswerCount === 1 ? "" : "s"} feel →
            </button>
          )}
        </div>

        {posted ? (
          <div className="px-4 py-4">
            <p className="font-display text-lg font-medium text-[var(--foreground)]">{result}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {onBrowseToday && (
                <button
                  type="button"
                  onClick={onBrowseToday}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
                >
                  See today’s answers
                </button>
              )}
              <button
                type="button"
                onClick={() => setPosted(null)}
                className="rounded-full border border-[var(--border-base)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--accent)]"
              >
                Say more
              </button>
            </div>
          </div>
        ) : (
          <form
            className="px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="quick-compose" className="sr-only">
              Your answer
            </label>
            <textarea
              id="quick-compose"
              value={text}
              onChange={(e) => {
                setText(e.target.value.slice(0, MAX_CHARS));
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={text ? 3 : 2}
              placeholder={
                checkedInToday
                  ? "Something else on your mind about AI?"
                  : "Say it in your own words — love it, fear it, or both."
              }
              className="w-full resize-none rounded-xl border border-[var(--border-base)] bg-transparent px-3 py-2.5 text-[15px] text-[var(--user-ink)] outline-none transition focus:border-[var(--accent)]"
            />
            <div
              role="radiogroup"
              aria-label="How does it make you feel?"
              className="mt-2 flex flex-wrap gap-1.5"
            >
              {FEELINGS.map((f) => {
                const on = feeling === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setFeeling(on ? undefined : f.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      on
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--surface)]"
                        : "border-[var(--border-base)] text-[var(--foreground)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {f.short}
                  </button>
                );
              })}
            </div>
            {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onShare}
                title="Record audio or video, add a photo or tags"
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <Mic className="h-3.5 w-3.5" />
                Voice, video &amp; more
              </button>
              <div className="flex items-center gap-3">
                {text.length > MAX_CHARS - 60 && (
                  <span className="text-[11px] tabular-nums text-[var(--muted)]">
                    {MAX_CHARS - text.length}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={!text.trim() || busy}
                  className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)] disabled:opacity-50"
                >
                  {busy ? "Sharing…" : "Share"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
