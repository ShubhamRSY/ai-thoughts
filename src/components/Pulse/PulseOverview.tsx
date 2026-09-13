"use client";

import type { FeelingId } from "@/lib/types";
import type { FeelingTally } from "@/lib/feelings";
import { FEELINGS } from "@/lib/feelings";
import { BRAND } from "@/lib/brand";

interface PulseOverviewProps {
  tally: FeelingTally[];
  onOpenRoom: (id: FeelingId) => void;
}

/**
 * Quiet feeling shortcuts into rooms — no mood headline, no voice-count cards.
 */
export default function PulseOverview({ tally, onOpenRoom }: PulseOverviewProps) {
  const withCounts = FEELINGS.map((f) => ({
    feeling: f,
    count: tally.find((t) => t.id === f.id)?.count ?? 0,
  })).filter((x) => x.count > 0);

  if (withCounts.length === 0) return null;

  return (
    <section className="app-pad pt-5 pb-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
        Sit with a feeling
      </p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Open a room — {BRAND.community} who feel the same.
      </p>
      <div className="no-scrollbar -mx-[var(--pad-x)] mt-3 flex gap-2 overflow-x-auto px-[var(--pad-x)] pb-1 pr-[var(--pad-r)]">
        {withCounts.map(({ feeling: f }) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onOpenRoom(f.id)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition hover:opacity-90 ${f.chip}`}
          >
            {f.short}
          </button>
        ))}
      </div>
    </section>
  );
}
