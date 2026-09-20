"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Globe, Lock, ShieldCheck, X } from "lucide-react";
import NotificationSettings from "@/components/NotificationSettings";
import DevicePermissions from "@/components/DevicePermissions";
import ActivityLog from "@/components/ActivityLog";
import ArchivedTakes from "@/components/ArchivedTakes";
import SessionManager from "@/components/SessionManager";

type Privacy = "public" | "private" | "locked";
type Request = { handle: string; author: string; avatarUrl: string };
type Person = Request;

const OPTIONS: { id: Privacy; label: string; icon: typeof Globe; blurb: string }[] = [
  { id: "public", label: "Public", icon: Globe, blurb: "Anyone can see your takes and follow you." },
  {
    id: "private",
    label: "Private",
    icon: Lock,
    blurb: "People can find you, but only followers you approve see your takes.",
  },
  {
    id: "locked",
    label: "Locked",
    icon: ShieldCheck,
    blurb:
      "Hidden from search and your profile. Current followers keep access; nobody new can follow.",
  },
];

const json = { "Content-Type": "application/json" };

export default function AccountCenter({ onBack }: { onBack: () => void }) {
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [blocked, setBlocked] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the newest load may apply, and any local edit invalidates loads already
  // in flight — otherwise a slow, older response resurrects a row just removed.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [p, r, b] = await Promise.all([
        fetch("/api/account/privacy", { credentials: "include", cache: "no-store" }),
        fetch("/api/follows/requests", { credentials: "include", cache: "no-store" }),
        fetch("/api/blocks", { credentials: "include", cache: "no-store" }),
      ]);
      const [privacyData, requestsData, blockedData] = await Promise.all([
        p.ok ? p.json() : null,
        r.ok ? r.json() : null,
        b.ok ? b.json() : null,
      ]);
      if (seq !== loadSeq.current) return;
      if (privacyData) setPrivacy(privacyData.privacy);
      if (requestsData) setRequests(requestsData.requests ?? []);
      if (blockedData) setBlocked(blockedData.blocked ?? []);
    } catch {
      setError("Couldn’t load your settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (next: Privacy) => {
    if (next === privacy || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/privacy", {
        method: "PUT",
        credentials: "include",
        headers: json,
        body: JSON.stringify({ privacy: next }),
      });
      if (!res.ok) throw new Error();
      setPrivacy(next);
      // Switching level settles pending requests server-side; refetch the list.
      await load();
    } catch {
      setError("Couldn’t change that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (handle: string, action: "approve" | "decline") => {
    loadSeq.current++;
    setRequests((rs) => rs.filter((r) => r.handle !== handle));
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        credentials: "include",
        headers: json,
        body: JSON.stringify({ handle, action }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("Couldn’t update that request.");
      await load();
    }
  };

  const unblock = async (handle: string) => {
    loadSeq.current++;
    setBlocked((bs) => bs.filter((b) => b.handle !== handle));
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        credentials: "include",
        headers: json,
        body: JSON.stringify({ handle, action: "unblock" }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("Couldn’t unblock that account.");
      await load();
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="text-lg font-semibold text-[var(--foreground)]">Account Center</h2>

      <section className="mt-4 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Who can see your takes
        </p>
        <div className="mt-3 space-y-2" role="radiogroup" aria-label="Account privacy">
          {OPTIONS.map(({ id, label, icon: Icon, blurb }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={privacy === id}
              disabled={busy || privacy === null}
              onClick={() => void choose(id)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                privacy === id
                  ? "border-[var(--accent)] bg-[var(--surface-2)]"
                  : "border-[var(--border-base)] hover:border-[var(--accent)]"
              }`}
            >
              <Icon className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-[var(--foreground)]">{label}</span>
                <span className="block text-xs leading-relaxed text-[var(--muted)]">{blurb}</span>
              </span>
              {privacy === id && <Check className="h-4 w-4 text-[var(--accent)]" />}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
      </section>

      {requests.length > 0 && (
        <section className="mt-4 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Follow requests ({requests.length})
          </p>
          <ul className="mt-3 divide-y divide-[var(--border-base)]">
            {requests.map((r) => (
              <li key={r.handle} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                    {r.author}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">{r.handle}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label={`Approve ${r.handle}`}
                    onClick={() => void resolve(r.handle, "approve")}
                    className="rounded-full bg-[var(--accent)] p-2 text-[var(--surface)] hover:bg-[var(--accent-2)]"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Decline ${r.handle}`}
                    onClick={() => void resolve(r.handle, "decline")}
                    className="rounded-full border border-[var(--border-base)] p-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked.length > 0 && (
        <section className="mt-4 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Blocked accounts ({blocked.length})
          </p>
          <ul className="mt-3 divide-y divide-[var(--border-base)]">
            {blocked.map((b) => (
              <li key={b.handle} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                    {b.author}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">{b.handle}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Unblock ${b.handle}`}
                  onClick={() => void unblock(b.handle)}
                  className="shrink-0 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--accent)]"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Notifications
        </p>
        <NotificationSettings signedIn />
      </section>

      <section className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Device permissions
        </p>
        <DevicePermissions signedIn />
      </section>

      <section className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Your activity
        </p>
        <ActivityLog />
      </section>

      <section className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Archive
        </p>
        <ArchivedTakes />
      </section>

      <section className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Devices and sessions
        </p>
        <SessionManager />
      </section>

      <section className="mt-6 mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Help
        </p>
        <ul className="divide-y divide-[var(--border-base)] rounded-2xl border border-[var(--border-base)] bg-[var(--surface)]">
          {[
            { href: "/guidelines", label: "Community guidelines" },
            { href: "/privacy", label: "Privacy policy" },
            { href: "/terms", label: "Terms of service" },
            { href: "/contact", label: "Report a problem or contact us" },
          ].map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:text-[var(--accent)]"
              >
                {label}
                <span aria-hidden className="text-[var(--muted)]">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
