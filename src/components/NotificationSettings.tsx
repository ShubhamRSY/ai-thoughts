"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Mail, Smartphone } from "lucide-react";
import { readNudgePrefs, writeNudgePrefs, type NudgePrefs } from "@/lib/nudge";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** Push, the soft daily nudge, and email digests — all in one place. */
export default function NotificationSettings({ signedIn }: { signedIn: boolean }) {
  const [prefs, setPrefs] = useState<NudgePrefs>(() =>
    typeof window === "undefined" ? { enabled: false, lastShownDay: "", hour: 9 } : readNudgePrefs()
  );
  const [perm, setPerm] = useState<NotificationPermission>(() =>
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
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

  const setNudge = useCallback((enabled: boolean) => {
    const next = { ...readNudgePrefs(), enabled };
    writeNudgePrefs(next);
    setPrefs(next);
  }, []);

  const enableLocalNudge = useCallback(async () => {
    if (typeof Notification === "undefined") {
      alert("Notifications aren’t available here. Install the app to your home screen.");
      return;
    }
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result !== "granted") return;
    setNudge(true);
  }, [setNudge]);

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
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setPushOn(true);
      setNudge(true);
    } catch (e) {
      console.error(e);
      alert("Couldn’t enable Web Push on this device.");
    } finally {
      setPushBusy(false);
    }
  }, [signedIn, setNudge]);

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

  // Send only the field that changed: /api/prefs is a patch.
  const saveEmailPrefs = useCallback(
    async (next: { email_digest?: boolean; weekly_digest?: boolean }) => {
      if (!signedIn) return;
      setPrefsBusy(true);
      try {
        const res = await fetch("/api/prefs", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
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
    [signedIn]
  );

  return (
    <div className="space-y-3">
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
              onClick={() => (prefs.enabled ? setNudge(false) : void enableLocalNudge())}
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
                Optional — activity summaries and the weekly Voices episode. Off until you turn them on.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={emailDigest}
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
                  aria-pressed={weeklyDigest}
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
    </div>
  );
}
