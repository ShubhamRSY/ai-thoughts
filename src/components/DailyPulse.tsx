"use client";

import { useEffect, useMemo, useState } from "react";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { todayKey } from "@/lib/daily-prompt";
import SharedSpectrum from "@/components/SharedSpectrum";
import type { FeelingId } from "@/lib/types";

type Day = { day: string; feeling: FeelingId[] | null };

/** The 5-second daily act: tap one or many feelings — or "All" — and see your week and the community's. */
export default function DailyPulse({
  signedIn,
  onNeedSignIn,
  onTap,
}: {
  signedIn: boolean;
  onNeedSignIn: () => void;
  onTap?: (feelings: FeelingId[]) => void;
}) {
  const [week, setWeek] = useState<Day[] | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayKey();
  const feelingIds = useMemo(() => FEELINGS.map((f) => f.id), []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch(`/api/mood?day=${today}`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setWeek(d.week);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn, today]);

  const picked = week?.find((d) => d.day === today)?.feeling ?? null;
  const pickedSet = new Set(picked ?? []);

  const tap = async (feelings: FeelingId[]) => {
    if (!signedIn) return onNeedSignIn();
    setBusy(true);
    try {
      const res = await fetch("/api/mood", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feelings, day: today }),
      });
      if (!res.ok) return;
      const j = await res.json();
      setWeek(j.week);
      onTap?.(feelings);
    } finally {
      setBusy(false);
    }
  };

  // counts across the week — a day that picked "All" stored every feeling id, so each ticks once per day naturally
  const counts = new Map<string, number>();
  for (const d of week ?? []) for (const f of d.feeling ?? []) counts.set(f, (counts.get(f) ?? 0) + 1);
  const tally = [...counts].sort((a, b) => b[1] - a[1]);
  const top = tally[0];
  const topFeeling = top && feelingOf(top[0]);
  const allPicked = (picked?.length ?? 0) === FEELINGS.length;
  const pickAll = () => {
    if (allPicked) return void tap([]); // toggle All off
    return void tap(feelingIds);
  };
  const heart = (id: FeelingId) => {
    const next = new Set(picked ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return void tap([...next]);
  };

  return (
    <section className="app-pad mt-3" aria-label="Daily mood">
      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          How does AI feel today?
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Pick a feeling">
          <button
            type="button"
            disabled={busy}
            aria-pressed={allPicked}
            onClick={pickAll}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
              allPicked
                ? "bg-[var(--accent)] text-[var(--surface)]"
                : "border border-dashed border-[var(--border-base)] text-[var(--foreground)] hover:border-[var(--accent)]"
            }`}
          >
            All
          </button>
          {FEELINGS.map((f) => {
            const on = pickedSet.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => void heart(f.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                  on
                    ? "bg-[var(--accent)] text-[var(--surface)]"
                    : "border border-[var(--border-base)] text-[var(--foreground)] hover:border-[var(--accent)]"
                }`}
              >
                {f.short}
              </button>
            );
          })}
        </div>

        {week?.some((d) => d.feeling) && (
          <div className="mt-3 border-t border-[var(--border-base)] pt-3">
            <div className="flex items-end gap-2" aria-label="Your last 7 days">
              {week.map((d) => (
                <div
                  key={d.day}
                  className="flex flex-col items-center gap-1"
                  title={d.feeling ? (d.feeling.length ? feelingOf(d.feeling[0])?.short : "All") : "No check-in"}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      d.feeling?.length ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"
                    }`}
                  />
                  <span className="text-[10px] text-[var(--muted)]">
                    {new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}
                  </span>
                </div>
              ))}
            </div>
            {topFeeling && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Your week: mostly{" "}
                <span className="font-semibold text-[var(--foreground)]">{topFeeling.short.toLowerCase()}</span>{" "}
                ({top[1]} of 7 check-ins)
              </p>
            )}
          </div>
        )}

        <SharedSpectrum />
      </div>
    </section>
  );
}
