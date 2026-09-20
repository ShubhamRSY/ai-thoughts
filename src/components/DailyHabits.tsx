"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Share2 } from "lucide-react";
import { todayKey } from "@/lib/daily-prompt";
import { readNudgePrefs, writeNudgePrefs, type NudgePrefs } from "@/lib/nudge";

interface DailyHabitsProps {
  checkedInToday: boolean;
  displayHandle: string;
  signedIn: boolean;
  /** Opens the Account Center, where notification settings now live. */
  onOpenAccount?: () => void;
}

export default function DailyHabits({
  checkedInToday,
  displayHandle,
  signedIn,
  onOpenAccount,
}: DailyHabitsProps) {
  const [prefs, setPrefs] = useState<NudgePrefs>(() =>
    typeof window === "undefined" ? { enabled: false, lastShownDay: "", hour: 9 } : readNudgePrefs()
  );
  const [copied, setCopied] = useState(false);
  const [pushOn, setPushOn] = useState(false);

  // The reminder below needs to know whether push already covers today. Both
  // it and the nudge setting are changed in the Account Center, which replaces
  // this view while open — so re-reading on mount is enough.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch("/api/prefs", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setPushOn(Boolean(d.push_enabled));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!prefs.enabled || checkedInToday || pushOn) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const day = todayKey();
    if (prefs.lastShownDay === day) return;
    if (new Date().getHours() < prefs.hour) return;

    let cancelled = false;
    (async () => {
      const reg = await navigator.serviceWorker?.ready;
      if (cancelled || !reg) return;
      await reg.showNotification("Your AI take is waiting", {
        body: "Share how AI makes you feel today — while the prompt is still warm.",
        icon: "/icons/icon-192.png",
        tag: "aithoughts-daily",
        data: { url: "/app" },
      });
      const next = { ...readNudgePrefs(), lastShownDay: day };
      writeNudgePrefs(next);
      setPrefs(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [prefs.enabled, prefs.lastShownDay, prefs.hour, checkedInToday, pushOn]);

  const invite = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const text = `I’m saying how AI makes me feel on AI·Thoughts — love it, fear it, or both. Join me: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AI·Thoughts", text, url });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="mt-4 space-y-3">
      {onOpenAccount && (
        <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
              <BellRing className="h-5 w-5 text-[var(--accent-2)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--foreground)]">Notifications</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Push alerts, the daily nudge and email digests now live in your Account Center.
              </p>
              <button
                type="button"
                onClick={onOpenAccount}
                className="mt-3 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--accent)]"
              >
                Notification settings
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)]">
            <Share2 className="h-5 w-5 text-[var(--foreground)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Invite someone</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Growth starts with one person who disagrees with you about AI.
              {displayHandle ? ` Share as ${displayHandle}.` : ""}
            </p>
            <button
              type="button"
              onClick={() => void invite()}
              className="mt-3 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
            >
              {copied ? "Link copied" : "Invite a friend"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
