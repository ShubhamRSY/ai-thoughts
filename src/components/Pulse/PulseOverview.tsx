"use client";

import { Radio, ArrowRight, TrendingUp } from "lucide-react";
import type { Thought, FeelingId, ReactionCount } from "@/lib/types";
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

function topReaction(reactions: ReactionCount[]): string {
  const top = [...reactions].sort((a, b) => b.count - a.count)[0];
  return top ? `${top.type} ${top.count}` : "";
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

  const ep = Math.max(1, (total * 7 + (dominant?.count ?? 1) * 13) % 120);
  const langs = new Set(thoughts.map((t) => t.language ?? "en").filter(Boolean));
  const pct = Math.min(100, 15 + (thoughts.reduce((s, t) => s + t.reactions.reduce((a, r) => a + r.count, 0), 0) % 60));
  const topTake = [...thoughts].sort((a, b) => {
    const ra = a.reactions.reduce((s, r) => s + r.count, 0);
    const rb = b.reactions.reduce((s, r) => s + r.count, 0);
    return rb - ra;
  })[0];

  return (
    <section className="relative mx-4 mt-4 overflow-hidden rounded-3xl border border-zinc-800/70 bg-gradient-to-b from-[#17171d] to-[#121216] shadow-sm shadow-black/20 ring-1 ring-inset ring-white/[0.03]">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative px-4 pt-4">
        {/* Top line: label + EP */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400">
            <Radio className="h-3 w-3" />
            Live Pulse
          </div>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-500">
            EP {ep}
          </span>
        </div>

        {/* Headline */}
        <h1 className="mt-2 text-xl font-bold leading-snug tracking-tight text-zinc-50">
          {total > 0 && dominantMeta
            ? `Most hearts feel ${dominantMeta.short.toLowerCase()}`
            : "The pulse is warming up"}
        </h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          {total} voice{total === 1 ? "" : "s"} · {langs.size} language{langs.size === 1 ? "" : "s"}
          {topTake ? ` · top: ${topReaction(topTake.reactions)}` : ""}
        </p>

        {/* Mini wave */}
        <div className="mt-3.5 flex h-10 items-end gap-1">
          {FEELINGS.map((f) => {
            const count = tally.find((t) => t.id === f.id)?.count ?? 0;
            const amp = count > 0 ? 0.35 + 0.65 * (count / max) : 0.06;
            return (
              <button
                key={f.id}
                onClick={() => onOpenRoom(f.id)}
                aria-label={`${f.short}: ${count}`}
                className="group flex min-w-0 flex-1 flex-col items-center gap-0.5"
              >
                <div className="flex w-full flex-1 items-end justify-center overflow-hidden rounded-sm bg-zinc-950/60">
                  <div
                    className={`w-full rounded-sm transition-all duration-500 ${
                      count > 0
                        ? activeId === f.id
                          ? "bg-gradient-to-t from-violet-600 to-indigo-400"
                          : "bg-gradient-to-t from-zinc-700 to-zinc-600"
                        : "bg-zinc-800"
                    }`}
                    style={{ height: `${Math.max(6, amp * 100)}%` }}
                  />
                </div>
                <span className="hidden text-[8px] text-zinc-500 sm:inline">{f.short}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom: alive meter + join room */}
        <div className="mt-2.5 flex items-center gap-3 pb-4">
          <div className="flex items-center gap-2">
            <div className="h-1 w-16 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-zinc-500">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              {pct}% alive
            </span>
          </div>
          <button
            onClick={() => dominant && onOpenRoom(dominant.id)}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md shadow-violet-500/25 transition hover:brightness-110 active:scale-95"
          >
            {dominantMeta?.emoji} Join
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </section>
  );
}
