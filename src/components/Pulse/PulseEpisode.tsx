"use client";

import { CalendarDays, TrendingUp, Globe2, Play, ChevronRight } from "lucide-react";
import type { Thought, FeelingId, ReactionCount } from "@/lib/types";
import { feelingOf } from "@/lib/feelings";

interface PulseEpisodeProps {
  thoughts: Thought[];
  onOpenRoom: (id: FeelingId) => void;
}

function topSecondaryReaction(reactions: ReactionCount[]): string {
  const top = [...reactions].sort((a, b) => b.count - a.count)[0];
  return top ? `${top.type} ${top.count}` : "🔥 1";
}

export default function PulseEpisode({ thoughts, onOpenRoom }: PulseEpisodeProps) {
  if (thoughts.length === 0) return null;

  // Dominant feeling this episode
  const counts: Record<string, number> = {};
  for (const t of thoughts) if (t.feeling) counts[t.feeling] = (counts[t.feeling] ?? 0) + 1;
  const sorted = (Object.entries(counts) as [FeelingId, number][]).sort((a, b) => b[1] - a[1]);
  const [topId, topCount] = sorted[0] ?? ["love-it", 1];
  const top = feelingOf(topId);

  // Languages spoken
  const langs = new Set(thoughts.map((t) => t.language ?? "en").filter(Boolean));

  // Most-felt-with takes (top by total reactions, then content length)
  const featured = [...thoughts]
    .sort((a, b) => {
      const ra = a.reactions.reduce((s, r) => s + r.count, 0);
      const rb = b.reactions.reduce((s, r) => s + r.count, 0);
      return rb - ra;
    })
    .slice(0, 2);

  const ep = Math.max(1, (thoughts.length * 7 + topCount * 13) % 120);
  const pct = Math.min(100, 15 + (totalReactions(thoughts) % 60));
  const topTake = featured[0];

  return (
    <section className="app-pad pt-4">
      <div className="overflow-hidden rounded-2xl border border-[var(--border-base)] bg-[var(--surface)]">
        {/* Episode header */}
        <div className="flex items-center justify-between px-4 pt-4">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            <CalendarDays className="h-3.5 w-3.5" />
            Weekly Voices
          </div>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-teal-800">
            EP {ep}
          </span>
        </div>

        {/* Headline */}
        <div className="px-4 pt-3">
          <h2 className="font-display text-lg font-bold leading-snug text-[var(--foreground)]">
            This week felt {top ? top.short.toLowerCase() : "alive"}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {thoughts.length} voice{thoughts.length === 1 ? "" : "s"} · {langs.size} language
            {langs.size === 1 ? "" : "s"} · most echoed: {topTake ? topSecondaryReaction(topTake.reactions) : "🔥 1"}
          </p>

          {/* Live mini-meter */}
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--muted)]">
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              {pct}% alive
            </span>
          </div>
        </div>

        {/* Featured takes */}
        <div className="px-4 pt-3">
          {featured.map((t) => {
            const f = feelingOf(t.feeling);
            return (
              <button
                key={t.id}
                onClick={() => t.feeling && onOpenRoom(t.feeling)}
                className="mb-1.5 flex w-full items-center gap-2.5 rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-left transition hover:border-teal-200"
              >
                <span
                  aria-hidden
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-base ${f?.chip ?? ""}`}
                >
                  {f?.emoji ?? "🗣️"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[var(--foreground)]">
                    {t.handle}
                    {t.languageLabel ? (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-normal text-[var(--muted)]">
                        <Globe2 className="h-2.5 w-2.5" />
                        {t.languageLabel}
                      </span>
                    ) : null}
                  </p>
                  <p dir="auto" className="truncate text-[11px] text-[var(--muted)]">{t.content}</p>
                </div>
                <Play className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              </button>
            );
          })}
        </div>

        {/* Footer CTA */}
        <div className="px-4 pb-4 pt-2">
          <button
            onClick={() => onOpenRoom(topId)}
            className="flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-[var(--accent)] transition hover:text-[var(--accent-2)]"
          >
            Hear everyone who felt {top ? top.short.toLowerCase() : "this"} today
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

function totalReactions(thoughts: Thought[]): number {
  return thoughts.reduce((s, t) => s + t.reactions.reduce((a, r) => a + r.count, 0), 0);
}
