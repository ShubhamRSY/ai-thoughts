"use client";

import type { Thought, FeelingId } from "@/lib/types";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { BRAND } from "@/lib/brand";

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
  onOpenRoom,
}: PulseOverviewProps) {
  const total = thoughts.length;
  const dominant = tally[0];
  const dominantMeta = dominant ? feelingOf(dominant.id) : undefined;

  const withCounts = FEELINGS.map((f) => ({
    feeling: f,
    count: tally.find((t) => t.id === f.id)?.count ?? 0,
  })).filter((x) => x.count > 0);

  return (
    <section className="app-pad pt-6 pb-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
        {BRAND.community}
      </p>
      <h1 className="font-display mt-2 text-[1.75rem] font-medium leading-[1.2] tracking-tight text-[var(--foreground)]">
        {dominantMeta ? (
          <>
            Right now, people feel{" "}
            <em className="not-italic text-[var(--accent)]">{dominantMeta.short.toLowerCase()}</em>
          </>
        ) : (
          BRAND.tagline
        )}
      </h1>
      <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-[var(--muted)]">
        {total === 0
          ? "Share the first honest take."
          : `${total} voice${total === 1 ? "" : "s"} from around the world`}
      </p>

      {withCounts.length > 0 && (
        <div className="no-scrollbar -mx-[var(--pad-x)] mt-5 flex gap-2 overflow-x-auto px-[var(--pad-x)] pb-1 pr-[var(--pad-r)]">
          {withCounts.map(({ feeling: f, count }) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpenRoom(f.id)}
              className="shrink-0 rounded-full border border-[var(--border-base)] bg-[var(--surface)] px-3.5 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <span className="block text-sm font-medium text-[var(--foreground)]">{f.short}</span>
              <span className="block text-[11px] text-[var(--muted)]">
                {count} voice{count === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
