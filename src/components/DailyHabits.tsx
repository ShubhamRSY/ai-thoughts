"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Share2 } from "lucide-react";
import { todayKey } from "@/lib/daily-prompt";
import { getSiteUrl } from "@/lib/site";

const NUDGE_KEY = "aithoughts.daily-nudge.v1";

interface NudgePrefs {
  enabled: boolean;
  lastShownDay: string;
  hour: number; // local hour 0-23
}

function readPrefs(): NudgePrefs {
  try {
    const raw = localStorage.getItem(NUDGE_KEY);
    if (raw) return { hour: 9, lastShownDay: "", enabled: false, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { enabled: false, lastShownDay: "", hour: 9 };
}

function writePrefs(p: NudgePrefs) {
  try {
    localStorage.setItem(NUDGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

interface DailyHabitsProps {
  checkedInToday: boolean;
  displayHandle: string;
}

export default function DailyHabits({ checkedInToday, displayHandle }: DailyHabitsProps) {
  const [prefs, setPrefs] = useState<NudgePrefs>({ enabled: false, lastShownDay: "", hour: 9 });
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPrefs(readPrefs());
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, []);

  const enableNudge = useCallback(async () => {
    if (typeof Notification === "undefined") {
      alert("Notifications aren’t available in this browser. Add the app to your home screen for the best daily habit.");
      return;
    }
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result !== "granted") return;
    const next = { ...readPrefs(), enabled: true };
    writePrefs(next);
    setPrefs(next);
    const reg = await navigator.serviceWorker?.ready;
    await reg?.showNotification("Daily Voices reminder on", {
      body: "We’ll nudge you here when you open the app if you haven’t shared today.",
      icon: "/icons/icon-192.png",
      tag: "aithoughts-nudge-on",
    });
  }, []);

  const disableNudge = useCallback(() => {
    const next = { ...readPrefs(), enabled: false };
    writePrefs(next);
    setPrefs(next);
  }, []);

  // Soft daily nudge when they open the app and haven’t checked in
  useEffect(() => {
    if (!prefs.enabled || checkedInToday) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const day = todayKey();
    if (prefs.lastShownDay === day) return;
    const hour = new Date().getHours();
    if (hour < prefs.hour) return;

    let cancelled = false;
    (async () => {
      const reg = await navigator.serviceWorker?.ready;
      if (cancelled || !reg) return;
      await reg.showNotification("Your AI take is waiting", {
        body: "One honest voice a day. Open AI·Thoughts and answer today’s prompt.",
        icon: "/icons/icon-192.png",
        tag: "aithoughts-daily",
        data: { url: "/app" },
      });
      const next = { ...readPrefs(), lastShownDay: day };
      writePrefs(next);
      setPrefs(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [prefs.enabled, prefs.lastShownDay, prefs.hour, checkedInToday]);

  const invite = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.origin : getSiteUrl();
    const text = `I’m sharing honest takes about how AI is changing us on AI·Thoughts. Join me: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AI·Thoughts", text, url });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(`${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
            <BellRing className="h-5 w-5 text-[var(--accent-2)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Daily nudge</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Like a calendar reminder — not a spam feed. We’ll ping you if you open the app and
              haven’t shared today.
            </p>
            <button
              type="button"
              onClick={() => (prefs.enabled ? disableNudge() : void enableNudge())}
              className="mt-3 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--accent)]"
            >
              {prefs.enabled
                ? "Turn off nudge"
                : perm === "denied"
                  ? "Notifications blocked in browser"
                  : "Turn on daily nudge"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)]">
            <Share2 className="h-5 w-5 text-[var(--foreground)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Invite someone</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Growth like the big apps starts with one person who disagrees with you about AI.
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
