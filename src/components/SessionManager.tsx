"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

type Session = {
  sid: string;
  label: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
};

const json = { "Content-Type": "application/json" };

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Where you're signed in, with the ability to end sessions you don't recognise. */
export default function SessionManager() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const res = await fetch("/api/account/sessions", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (seq === loadSeq.current) setSessions(data.sessions ?? []);
    } catch {
      if (seq === loadSeq.current) setError("Couldn’t load your devices.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: object) => {
    const res = await fetch("/api/account/sessions", {
      method: "POST",
      credentials: "include",
      headers: json,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error();
  };

  const revoke = async (sid: string) => {
    loadSeq.current++;
    setSessions((s) => s && s.filter((x) => x.sid !== sid));
    try {
      await post({ action: "revoke", sid });
    } catch {
      setError("Couldn’t sign that device out.");
      await load();
    }
  };

  const revokeOthers = async () => {
    if (!window.confirm("Sign out of every other device? You’ll stay signed in here.")) return;
    setBusy(true);
    try {
      await post({ action: "revoke_others" });
      await load();
    } catch {
      setError("Couldn’t sign out other devices.");
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    if (!window.confirm("Sign out everywhere, including this device?")) return;
    setBusy(true);
    try {
      await post({ action: "revoke_all" });
      // The server already ended every session; this clears the in-memory user too.
      await signOut();
      router.replace("/");
    } catch {
      setError("Couldn’t sign you out everywhere.");
      setBusy(false);
    }
  };

  const others = (sessions ?? []).filter((s) => !s.current).length;

  return (
    <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
      {sessions === null ? (
        <p className="text-xs text-[var(--muted)]">{error ?? "Loading…"}</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          No tracked devices yet — they’ll appear the next time the app loads.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-base)]">
          {sessions.map((s) => (
            <li key={s.sid} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  {s.label}
                  {s.current && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-2)]">
                      This device
                    </span>
                  )}
                </span>
                <span className="block text-xs text-[var(--muted)]">Active {ago(s.last_seen_at)}</span>
              </span>
              {!s.current && (
                <button
                  type="button"
                  aria-label={`Sign out ${s.label}`}
                  onClick={() => void revoke(s.sid)}
                  className="shrink-0 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-rose-300 hover:text-rose-700"
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && sessions !== null && <p className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border-base)] pt-3">
        {others > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void revokeOthers()}
            className="rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50"
          >
            Sign out other devices
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void revokeAll()}
          className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Sign out everywhere
        </button>
      </div>
    </div>
  );
}
