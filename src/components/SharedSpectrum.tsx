"use client";

import { useEffect, useState } from "react";
import { feelingOf } from "@/lib/feelings";
import { BRAND } from "@/lib/brand";

interface Tally {
  id: string;
  count: number;
}

/** "Right now, 58% of Voices feel X" — shown after sharing, not on the home feed. */
export default function SharedSpectrum() {
  const [tally, setTally] = useState<Tally[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/feelings/spectrum", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setTally(Array.isArray(data.tally) ? data.tally : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const top = tally[0];
  const topFeeling = top && feelingOf(top.id);
  if (!top || !topFeeling || total < 5) return null;

  const second = tally[1];
  const secondFeeling = second && feelingOf(second.id);
  const topPct = Math.round((top.count / total) * 100);
  const secondPct = second ? Math.round((second.count / total) * 100) : 0;

  return (
    <p className="rounded-xl border border-[var(--border-base)] bg-[var(--accent-soft)]/40 px-3 py-2.5 text-xs leading-relaxed text-[var(--accent-2)]">
      Right now, {topPct}% of {BRAND.community} feel{" "}
      <span className="font-semibold">{topFeeling.short.toLowerCase()}</span>
      {secondFeeling
        ? `, ${secondPct}% feel ${secondFeeling.short.toLowerCase()}`
        : ""}
      .
    </p>
  );
}
