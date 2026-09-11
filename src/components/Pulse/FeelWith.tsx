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
    <section className="mt-5 px-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        <Users className="h-3.5 w-3.5" />
        Feel with
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {ordered.map((f) => {
          const count = tally.find((t) => t.id === f.id)?.count ?? 0;
          return (
            <button
              key={f.id}
              onClick={() => onOpenRoom(f.id)}
              className="flex shrink-0 flex-col items-start gap-1 rounded-2xl border border-[var(--border-base)] bg-white px-3 py-2.5 text-left shadow-sm shadow-slate-900/5 transition hover:border-teal-200"
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl border ${f.chip} text-base`}>
                <span aria-hidden>{f.emoji}</span>
              </span>
              <span className="text-xs font-semibold text-[var(--foreground)]">{f.short}</span>
              <span className="text-[10px] text-[var(--muted)]">
                {count > 0 ? `${count} voice${count === 1 ? "" : "s"}` : "Join"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
