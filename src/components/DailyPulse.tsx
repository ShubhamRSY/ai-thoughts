"use client";

import { useEffect, useState } from "react";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { todayKey } from "@/lib/daily-prompt";
import SharedSpectrum from "@/components/SharedSpectrum";
import type { FeelingId } from "@/lib/types";

type Day = { day: string; feeling: string | null };

/** The 5-second daily act: tap one feeling, see your week and the community's. */
export default function DailyPulse({
  signedIn,
  onNeedSignIn,
  onTap,
}: {
  signedIn: boolean;
  onNeedSignIn: () => void;
  onTap?: (feeling: FeelingId) => void;
}) {
  const [week, setWeek] = useState<Day[] | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayKey();

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

  const tap = async (feeling: FeelingId) => {
    if (!signedIn) return onNeedSignIn();
    setBusy(true);
    try {
      const res = await fetch("/api/mood", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeling, day: today }),
      });
      if (!res.ok) return;
      setWeek((await res.json()).week);
      onTap?.(feeling);
    } finally {
      setBusy(false);
    }
  };

  const picked = week?.find((d) => d.day === today)?.feeling ?? null;
  const counts = new Map<string, number>();
  for (const d of week ?? []) if (d.feeling) counts.set(d.feeling, (counts.get(d.feeling) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  const topFeeling = top && feelingOf(top[0]);

  return (
    <section className="app-pad mt-3" aria-label="Daily mood">
      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          How does AI feel today?
        </p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Pick a feeling">
          {FEELINGS.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={busy}
              aria-pressed={picked === f.id}
              onClick={() => void tap(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                picked === f.id
                  ? "bg-[var(--accent)] text-[var(--surface)]"
                  : "border border-[var(--border-base)] text-[var(--foreground)] hover:border-[var(--accent)]"
              }`}
            >
              {f.short}
            </button>
          ))}
        </div>

        {week?.some((d) => d.feeling) && (
          <div className="mt-3 border-t border-[var(--border-base)] pt-3">
            <div className="flex items-end gap-2" aria-label="Your last 7 days">
              {week.map((d) => (
                <div key={d.day} className="flex flex-col items-center gap-1" title={d.feeling ? feelingOf(d.feeling)?.short : "No check-in"}>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${d.feeling ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"}`}
                  />
                  <span className="text-[10px] text-[var(--muted)]">
                    {new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}
                  </span>
                </div>
              ))}
            </div>
            {topFeeling && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Your week: mostly <span className="font-semibold text-[var(--foreground)]">{topFeeling.short.toLowerCase()}</span> ({top[1]} of 7 days).
              </p>
            )}
          </div>
        )}

        <div className="mt-3 empty:hidden">
          <SharedSpectrum />
        </div>
      </div>
    </section>
  );
}
