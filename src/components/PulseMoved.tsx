"use client";

import { useEffect, useState } from "react";
import { Activity, X } from "lucide-react";
import { feelingOf } from "@/lib/feelings";
import { todayKey } from "@/lib/daily-prompt";
import type { FeelingId } from "@/lib/types";

interface PulseMoveData {
  hasData: boolean;
  today: { count: number; feeling?: FeelingId | null };
  yesterday: { count: number; feeling?: FeelingId | null };
}

const DISMISS_PREFIX = "aithoughts.pulsemoved.shown.";

function dismissKey(): string {
  try {
    return DISMISS_PREFIX + todayKey();
  } catch {
    return "";
  }
}

/** "Here's how the pulse moved since you were last here" — one slim line a day. */
export default function PulseMoved() {
  const [data, setData] = useState<PulseMoveData | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = dismissKey();
    if (key) {
      try {
        if (localStorage.getItem(key) === "1") {
          setHidden(true);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    fetch("/api/feelings/pulse-move", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden || !data || !data.hasData || data.today.count === 0) return null;

  const todayTop = data.today.feeling ? feelingOf(data.today.feeling) : null;
  const yesterdayTop = data.yesterday.feeling ? feelingOf(data.yesterday.feeling) : null;
  const plain = `${data.today.count} new take${data.today.count === 1 ? "" : "s"} today`;
  const message =
    todayTop && yesterdayTop && yesterdayTop.id !== todayTop.id && data.yesterday.count > 0
      ? `Yesterday the pulse leaned ${yesterdayTop.short.toLowerCase()}. Today it's ${todayTop.short.toLowerCase()} — ${plain}.`
      : todayTop
        ? `${plain} today, and it still leans ${todayTop.short.toLowerCase()}.`
        : `${plain} — the pulse is moving.`;

  const dismiss = () => {
    const key = dismissKey();
    if (key) {
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    }
    setHidden(true);
  };

  return (
    <section className="app-pad mt-3">
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border-base)] bg-[var(--accent-soft)]/40 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" strokeWidth={2.2} />
          <p className="text-xs leading-relaxed text-[var(--accent-2)]">{message}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}