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
  // Live channel health from the server, distinct from the stored preference:
  // { count, mine } — who will actually be pushed to, and whether this browser
  // is one of them. null = not checked yet.
  const [health, setHealth] = useState<{ count: number; mine: boolean } | null>(null);
  // iOS only exposes Web Push to Home Screen web apps, so an iPhone in a plain
  // Safari tab can have push enabled here and still never receive anything.
  const [needsHomeScreen, setNeedsHomeScreen] = useState(false);
  const [emailDigest, setEmailDigest] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [prefsBusy, setPrefsBusy] = useState(false);

  /** Ask the server who is really registered, comparing against what this browser holds. */
  const refreshHealth = useCallback(async () => {
    if (!signedIn) return;
    let endpoint: string | null = null;
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        endpoint = (await reg?.pushManager.getSubscription())?.endpoint ?? null;
      }
    } catch {
      /* no registration — still worth asking for the account-wide count */
    }
    try {
      const res = await fetch("/api/push/status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      if (res.ok) setHealth(await res.json());
    } catch {
      /* leave the last known state rather than flashing an empty warning */
    }
  }, [signedIn]);

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
      if (!cancelled) await refreshHealth();
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, refreshHealth]);

  // Device capability, independent of account state. Checked after mount so the
  // server render and the first client render agree.
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS reports itself as macOS and only gives itself away here.
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!ios) return;
    const asApp =
      // Non-standard: Safari on iOS only, absent everywhere else.
      (navigator as { standalone?: boolean }).standalone ||
      window.matchMedia?.("(display-mode: standalone)").matches;
    setNeedsHomeScreen(!asApp);
  }, []);

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
      await refreshHealth();
    } catch (e) {
      console.error(e);
      alert("Couldn’t enable Web Push on this device.");
    } finally {
      setPushBusy(false);
    }
  }, [signedIn, setNudge, refreshHealth]);

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
      // Re-read even after a partial failure: the honest count matters more
      // than the optimistic one, and this is exactly when they'd disagree.
      await refreshHealth();
      setPushBusy(false);
    }
  }, [refreshHealth]);

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

  // Derived from live server state, not the stored preference — the whole point
  // is that the preference can say "on" while nobody is registered.
  const noPushChannel = health !== null && health.count === 0;
  const lostOnThisDevice =
    health !== null && health.count > 0 && perm === "granted" && !health.mine;

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

            {health !== null && (
              <div
                role="status"
                className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                  noPushChannel || lostOnThisDevice
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-[var(--border-base)] bg-[var(--surface-2)] text-[var(--muted)]"
                }`}
              >
                {noPushChannel ? (
                  <>
                    <span className="font-semibold">No device is receiving push.</span>{" "}
                    Push can’t reach you until you enable it somewhere — security
                    alerts still go to your email.
                  </>
                ) : lostOnThisDevice ? (
                  <>
                    <span className="font-semibold">This device stopped receiving push.</span>{" "}
                    Its registration expired. Turn push off and back on here to
                    restore it; other devices are unaffected.
                  </>
                ) : (
                  <>
                    Receiving push on{" "}
                    <span className="font-semibold text-[var(--foreground)]">
                      {health.count} {health.count === 1 ? "device" : "devices"}
                    </span>
                    {health.mine ? ", including this one." : "."}
                  </>
                )}
              </div>
            )}

            {needsHomeScreen && (
              <p className="mt-2 text-xs leading-relaxed text-amber-800">
                On iPhone or iPad, push only works after adding this app to your Home
                Screen. Until then these alerts reach you by email.
              </p>
            )}
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
