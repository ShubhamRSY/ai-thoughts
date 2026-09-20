"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Camera, Mic } from "lucide-react";

type Device = "notifications" | "camera" | "microphone";
type State = "granted" | "denied" | "prompt" | "unknown";

const ITEMS: { id: Device; label: string; icon: typeof Bell }[] = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "microphone", label: "Microphone", icon: Mic },
];

async function readState(id: Device): Promise<State> {
  // The Permissions API is the more reliable source (Notification.permission can
  // lag or disagree, e.g. in headless browsers); use it first for everything.
  try {
    const status = await navigator.permissions.query({ name: id as PermissionName });
    return status.state;
  } catch {
    if (id === "notifications" && typeof Notification !== "undefined") {
      return Notification.permission === "default" ? "prompt" : Notification.permission;
    }
    // Safari/Firefox can't report camera or microphone state without asking.
    return "unknown";
  }
}

async function request(id: Device): Promise<void> {
  if (id === "notifications") {
    await Notification.requestPermission();
    return;
  }
  // Open the device just long enough to trigger the browser prompt, then release it.
  const stream = await navigator.mediaDevices.getUserMedia(
    id === "camera" ? { video: true } : { audio: true }
  );
  stream.getTracks().forEach((t) => t.stop());
}

const LABEL: Record<State, string> = {
  granted: "Allowed",
  denied: "Blocked",
  prompt: "Not asked yet",
  unknown: "Unknown",
};

function hint(id: Device, state: State): string | null {
  if (state === "denied") return "Blocked — re-enable it in your browser or device settings.";
  if (state === "unknown") {
    return id === "notifications"
      ? "Not available here. Install the app to your home screen."
      : "This browser can’t tell us — we’ll ask when you record.";
  }
  return null;
}

export default function DevicePermissions({ signedIn }: { signedIn: boolean }) {
  const [states, setStates] = useState<Record<Device, State>>({
    notifications: "unknown",
    camera: "unknown",
    microphone: "unknown",
  });
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState<Device | null>(null);

  const refresh = useCallback(async () => {
    const entries = await Promise.all(ITEMS.map(async (i) => [i.id, await readState(i.id)] as const));
    setStates(Object.fromEntries(entries) as Record<Device, State>);
  }, []);

  useEffect(() => {
    void refresh();
    // Coming back from the browser's site settings should reflect the change.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/prefs", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPushOn(Boolean(d?.push_enabled)))
      .catch(() => {});
  }, [signedIn]);

  const allow = async (id: Device) => {
    setBusy(id);
    try {
      await request(id);
    } catch {
      /* denied or dismissed — the refreshed state says which */
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
      <ul className="divide-y divide-[var(--border-base)]">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const state = states[id];
          const note = hint(id, state);
          return (
            <li key={id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
                  <span
                    className={`text-xs font-semibold ${
                      state === "granted"
                        ? "text-[var(--accent)]"
                        : state === "denied"
                          ? "text-rose-700"
                          : "text-[var(--muted)]"
                    }`}
                  >
                    {LABEL[state]}
                  </span>
                </div>
                {note && <p className="mt-0.5 text-xs text-[var(--muted)]">{note}</p>}
                {state === "prompt" && (
                  <button
                    type="button"
                    disabled={busy === id}
                    onClick={() => void allow(id)}
                    className="mt-2 rounded-full border border-[var(--border-base)] px-3 py-1 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    {busy === id ? "Asking…" : `Allow ${label.toLowerCase()}`}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {pushOn && states.notifications === "denied" && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
          Push alerts are on in your settings, but this browser has blocked notifications — you
          won’t receive them until you allow notifications here.
        </p>
      )}
    </div>
  );
}
