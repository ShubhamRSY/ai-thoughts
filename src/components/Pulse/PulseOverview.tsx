"use client";

import { AudioWaveform, Radio, ArrowRight } from "lucide-react";
import type { Thought, FeelingId } from "@/lib/types";
import { FEELINGS, feelingOf } from "@/lib/feelings";

export interface FeelingTally {
  id: FeelingId;
  count: number;
}

interface PulseOverviewProps {
  thoughts: Thought[];
  tally: FeelingTally[];
  /** Sorted normalized [0..1] amplitude for each feeling, matching FEELINGS order. */
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
    <section className="px-4 pt-4">
      <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/80 to-zinc-950/60">
        <div className="px-4 pt-4">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-400">
            <Radio className="h-3.5 w-3.5" />
            Live Pulse right now
          </div>

          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-100">
                {total > 0 && dominantMeta
                  ? `Most hearts feel ${dominantMeta.short.toLowerCase()}`
                  : "The pulse is warming up"}
              </h1>
              <p className="mt-0.5 text-xs text-zinc-400">
                {total > 0
                  ? `${total} voice${total === 1 ? "" : "s"} on the pulse · every feeling belongs`
                  : "Real voices about AI — all ages, every language."}
              </p>
            </div>
            {dominantMeta && (
              <div
                aria-hidden
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/60 text-2xl"
              >
                {dominantMeta.emoji}
              </div>
            )}
          </div>
        </div>

        {/* Mood wave — each feeling is a wave bar sized by its share of voices */}
        <div className="mt-4 flex h-24 items-end gap-1.5 px-4">
          {FEELINGS.map((f) => {
            const count = tally.find((t) => t.id === f.id)?.count ?? 0;
            const amp = count > 0 ? 0.35 + 0.65 * (count / max) : 0.06;
            const isActive = activeId === f.id;
            return (
              <button
                key={f.id}
                onClick={() => onOpenRoom(f.id)}
                aria-label={`${f.short}: ${count} voices`}
                className="group flex min-w-0 flex-1 flex-col items-center gap-1"
              >
                <div className="flex w-full flex-1 items-end justify-center overflow-hidden rounded-md bg-zinc-950/60">
                  <div
                    className={`w-full rounded-md transition-all duration-500 ${
                      count > 0
                        ? isActive
                          ? "bg-gradient-to-t from-violet-600 to-indigo-400"
                          : "bg-gradient-to-t from-zinc-700 to-zinc-600"
                        : isActive
                          ? "bg-violet-500/30"
                          : "bg-zinc-800"
                    }`}
                    style={{ height: `${Math.max(6, amp * 100)}%` }}
                  />
                </div>
                <span
                  className={`text-[10px] font-medium ${
                    count > 0 ? "text-zinc-300" : "text-zinc-600"
                  }`}
                >
                  {f.short}
                </span>
                <span className="-mt-1 text-[10px] tabular-nums text-zinc-500">
                  {count > 0 ? count : "·"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Voice chips + open active room */}
        <div className="flex items-center gap-2 px-4 pb-4 pt-3">
          <AudioWaveform className="h-4 w-4 shrink-0 text-violet-400" />
          {activeId ? (
            <button
              onClick={() => onOpenRoom(activeId)}
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20"
            >
              <span aria-hidden>{feelingOf(activeId)?.emoji}</span>
              Feeling this too — join the room
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <p className="text-xs text-zinc-500">
              Tap a wave to hear everyone who feels that way.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
