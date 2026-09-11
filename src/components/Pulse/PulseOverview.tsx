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

  const ranked = [...FEELINGS]
    .map((f) => ({
      feeling: f,
      count: tally.find((t) => t.id === f.id)?.count ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <section className="px-[var(--shell-pad)] pt-4">
      <div className="rounded-2xl border border-[var(--border-base)] bg-white p-4 shadow-sm shadow-slate-900/5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Live mood
            </p>
            <h2 className="font-display mt-1 text-lg font-semibold leading-snug text-[var(--foreground)]">
              {dominantMeta ? (
                <>
                  Most voices feel{" "}
                  <span className="text-[var(--accent)]">{dominantMeta.short.toLowerCase()}</span>
                </>
              ) : (
                "The pulse is warming up"
              )}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {total === 0
                ? "Be the first to share how AI makes you feel"
                : `${total.toLocaleString()} voice${total === 1 ? "" : "s"} on the pulse`}
            </p>
          </div>
          {dominantMeta && (
            <button
              type="button"
              onClick={() => dominant && onOpenRoom(dominant.id)}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left transition hover:border-teal-300 ${dominantMeta.chip}`}
            >
              <div className="text-xs font-semibold">{dominantMeta.short}</div>
              <div className="mt-0.5 text-[10px] opacity-80">Open room</div>
            </button>
          )}
        </div>

        <ul className="mt-4 space-y-2">
          {ranked.map(({ feeling: f, count }) => {
            const pct = count > 0 ? Math.max(8, Math.round((count / max) * 100)) : 0;
            const active = activeId === f.id;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onOpenRoom(f.id)}
                  aria-label={`${f.label}: ${count} voices`}
                  className={`group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition ${
                    active
                      ? "bg-[var(--accent-soft)]"
                      : "hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${f.chip}`}
                    aria-hidden
                  >
                    {f.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-[var(--foreground)]">
                        {f.short}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                        {count > 0 ? `${count}` : "—"}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          active || count === max && count > 0
                            ? "bg-[var(--accent)]"
                            : count > 0
                              ? "bg-teal-300"
                              : "bg-transparent"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
