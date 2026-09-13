"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Share2, Mail, Smartphone } from "lucide-react";
import { todayKey } from "@/lib/daily-prompt";

const NUDGE_KEY = "aithoughts.daily-nudge.v1";

interface NudgePrefs {
  enabled: boolean;
  lastShownDay: string;
  hour: number;
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

interface DailyHabitsProps {
  checkedInToday: boolean;
  displayHandle: string;
  signedIn: boolean;
}

export default function DailyHabits({
  checkedInToday,
  displayHandle,
  signedIn,
}: DailyHabitsProps) {
  const [prefs, setPrefs] = useState<NudgePrefs>(() =>
    typeof window === "undefined" ? { enabled: false, lastShownDay: "", hour: 9 } : readPrefs()
  );
  const [perm, setPerm] = useState<NotificationPermission>(() =>
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [copied, setCopied] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [prefsBusy, setPrefsBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const [prefsRes, vapidRes] = await Promise.all([
          fetch("/api/prefs", { credentials: "include", cache: "no-store" }),
          fetch("/api/push/vapid", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (prefsRes.ok) {
          const data = await prefsRes.json();
          setEmailDigest(Boolean(data.email_digest));
          setWeeklyDigest(Boolean(data.weekly_digest));
          setPushOn(Boolean(data.push_enabled));
        }
        if (vapidRes.ok) {
          const v = await vapidRes.json();
          setPushConfigured(Boolean(v.configured));
        } else {
          setPushConfigured(false);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const enableLocalNudge = useCallback(async () => {
    if (typeof Notification === "undefined") {
      alert("Notifications aren’t available here. Install the app to your home screen.");
      return;
    }
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result !== "granted") return;
    const next = { ...readPrefs(), enabled: true };
    writePrefs(next);
    setPrefs(next);
  }, []);

  const disableLocalNudge = useCallback(() => {
    const next = { ...readPrefs(), enabled: false };
    writePrefs(next);
    setPrefs(next);
  }, []);

  const enableWebPush = useCallback(async () => {
    if (!signedIn) {
      alert("Sign in to get push alerts when the app is closed.");
      return;
    }
    setPushBusy(true);
    try {
      const vapid = await fetch("/api/push/vapid").then((r) => r.json());
      if (!vapid.publicKey) {
        setPushConfigured(false);
        alert("Web Push isn’t configured on the server yet (VAPID keys).");
        return;
      }
      const permission = await Notification.requestPermission();
      setPerm(permission);
      if (permission !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setPushOn(true);
      const next = { ...readPrefs(), enabled: true };
      writePrefs(next);
      setPrefs(next);
    } catch (e) {
      console.error(e);
      alert("Couldn’t enable Web Push on this device.");
    } finally {
      setPushBusy(false);
    }
  }, [signedIn]);

  const disableWebPush = useCallback(async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      await sub?.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setPushOn(false);
    } catch {
      /* ignore */
    } finally {
      setPushBusy(false);
    }
  }, []);

  const saveEmailPrefs = useCallback(
    async (next: { email_digest?: boolean; weekly_digest?: boolean }) => {
      if (!signedIn) return;
      setPrefsBusy(true);
      try {
        const res = await fetch("/api/prefs", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email_digest: next.email_digest ?? emailDigest,
            weekly_digest: next.weekly_digest ?? weeklyDigest,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setEmailDigest(Boolean(data.email_digest));
          setWeeklyDigest(Boolean(data.weekly_digest));
        }
      } finally {
        setPrefsBusy(false);
      }
    },
    [signedIn, emailDigest, weeklyDigest]
  );

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
        body: "Someone may have reacted — open Voices while today’s thread is warm.",
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
      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
            <Smartphone className="h-5 w-5 text-[var(--accent-2)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Push alerts</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Works when the app is closed — replies, reactions, and people you feel with.
              {!pushConfigured && " (Server VAPID keys not set yet.)"}
            </p>
            <button
              type="button"
              disabled={pushBusy || !pushConfigured}
              onClick={() => (pushOn ? void disableWebPush() : void enableWebPush())}
              className="mt-3 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50"
            >
              {pushBusy
                ? "Working…"
                : pushOn
                  ? "Turn off push"
                  : perm === "denied"
                    ? "Notifications blocked"
                    : "Enable Web Push"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
            <BellRing className="h-5 w-5 text-[var(--accent-2)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Soft daily nudge</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Backup reminder if Web Push is off. Same-day replies and reactions are the main hook.
            </p>
            <button
              type="button"
              onClick={() => (prefs.enabled ? disableLocalNudge() : void enableLocalNudge())}
              className="mt-3 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--accent)]"
            >
              {prefs.enabled ? "Turn off nudge" : "Turn on nudge"}
            </button>
          </div>
        </div>
      </div>

      {signedIn && (
        <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)]">
              <Mail className="h-5 w-5 text-[var(--foreground)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--foreground)]">Email digests</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Optional — activity summaries and the weekly Voices episode.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={prefsBusy}
                  onClick={() => {
                    const next = !emailDigest;
                    setEmailDigest(next);
                    void saveEmailPrefs({ email_digest: next });
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    emailDigest
                      ? "bg-[var(--accent)] text-[var(--surface)]"
                      : "border border-[var(--border-base)] text-[var(--foreground)]"
                  }`}
                >
                  Activity email
                </button>
                <button
                  type="button"
                  disabled={prefsBusy}
                  onClick={() => {
                    const next = !weeklyDigest;
                    setWeeklyDigest(next);
                    void saveEmailPrefs({ weekly_digest: next });
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    weeklyDigest
                      ? "bg-[var(--accent)] text-[var(--surface)]"
                      : "border border-[var(--border-base)] text-[var(--foreground)]"
                  }`}
                >
                  Weekly Voices
                </button>
              </div>
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
