"use client";

import { Users } from "lucide-react";
import type { FeelingId } from "@/lib/types";
import { FEELINGS } from "@/lib/feelings";
import type { FeelingTally } from "@/components/Pulse/PulseOverview";

interface FeelWithProps {
  tally: FeelingTally[];
  onOpenRoom: (id: FeelingId) => void;
}

export default function FeelWith({ tally, onOpenRoom }: FeelWithProps) {
  // Always show every feeling, but surface ones with voices first.
  const ordered = [...FEELINGS].sort((a, b) => {
    const ac = tally.find((t) => t.id === a.id)?.count ?? 0;
    const bc = tally.find((t) => t.id === b.id)?.count ?? 0;
    return bc - ac;
  });

  return (
    <section className="px-4 pt-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        <Users className="h-3.5 w-3.5" />
        Feel with
        <span className="font-normal normal-case text-zinc-600">— find your people</span>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {ordered.map((f) => {
          const count = tally.find((t) => t.id === f.id)?.count ?? 0;
          return (
            <button
              key={f.id}
              onClick={() => onOpenRoom(f.id)}
              className="flex shrink-0 flex-col items-start gap-1 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5 text-left transition hover:border-zinc-700 hover:bg-zinc-900/70"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${f.chip} text-lg`}>
                <span aria-hidden>{f.emoji}</span>
              </span>
              <span className="text-xs font-semibold text-zinc-200">{f.short}</span>
              <span className="text-[10px] text-zinc-500">
                {count > 0 ? `${count} voice${count === 1 ? "" : "s"} here` : "Start the room"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
