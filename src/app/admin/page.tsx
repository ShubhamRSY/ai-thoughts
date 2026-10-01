"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  RefreshCw,
  UserPlus,
  Trash2,
  Sprout,
  AlertTriangle,
  ExternalLink,
  HeartPulse,
  ScrollText,
  BadgeCheck,
  ShieldOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type FeelingBucket = { id: string; short: string; label: string; count: number; pct: number };
type SentimentSnapshot = {
  today: { total: number; buckets: FeelingBucket[] };
  last7d: { total: number; buckets: FeelingBucket[] };
  last30d: { total: number; buckets: FeelingBucket[] };
  daily: { day: string; total: number; dominant: { id: string; short: string; count: number } | null }[];
};
type AuditEntry = {
  id: string;
  action: string;
  actor_handle: string | null;
  via: "session" | "bearer";
  detail: Record<string, unknown>;
  ip: string | null;
  created_at: string;
};

type AdminData = {
  you: { handle: string; displayName: string };
  stats: { users: number; posts: number; messages: number; reportsOpen: number };
  settings: {
    maintenance: boolean;
    maintenanceMessage: string;
    invitesOpen: boolean;
    featuredPostId: string;
  };
  admins: { handle: string; source: "env" | "db" }[];
  keepers: string[];
  verifiedUsers: string[];
  lowTrustReporters?: { handle: string; rejected_90d: number; upheld: number }[];
  sentiment: SentimentSnapshot;
  auditLog: AuditEntry[];
  recentPosts: {
    id: string;
    handle: string;
    author: string;
    feeling: string | null;
    content: string;
    created_at: string;
  }[];
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [keeperInput, setKeeperInput] = useState("");
  const [adminInput, setAdminInput] = useState("");
  const [verifiedInput, setVerifiedInput] = useState("");
  const [maintMsg, setMaintMsg] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await fetch("/api/admin/me", { credentials: "include", cache: "no-store" });
      if (!me.ok) {
        setAuthorized(false);
        setData(null);
        return;
      }
      const meJson = await me.json();
      if (!meJson.isAdmin) {
        setAuthorized(false);
        setData(null);
        return;
      }
      setAuthorized(true);
      const res = await fetch("/api/admin/controls", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Could not load controls");
        return;
      }
      const json = (await res.json()) as AdminData;
      setData(json);
      setMaintMsg(json.settings.maintenanceMessage);
    } catch {
      setError("Network error");
      setAuthorized(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAuthorized(false);
      return;
    }
    void load();
  }, [authLoading, user, load]);

  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/controls", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Action failed");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (authLoading || authorized === null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-sm text-[var(--muted)]">
        Checking admin access…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <Shield className="mx-auto h-8 w-8 text-[var(--accent)]" />
        <h1 className="mt-4 font-display text-2xl font-medium">Admin</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Sign in with your admin account.</p>
        <Link
          href="/sign-in?next=/admin"
          className="mt-6 inline-block rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--surface)]"
        >
          Sign in
        </Link>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
        <h1 className="mt-4 font-display text-2xl font-medium">No access</h1>
        <Link href="/app" className="mt-6 inline-block text-sm font-semibold text-[var(--accent)]">
          Back to Voices
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Global control
          </p>
          <h1 className="font-display mt-1 text-2xl font-medium text-[var(--foreground)]">
            Admin
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {data?.you.displayName} · {data?.you.handle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}

      {data && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Users", data.stats.users],
              ["Takes", data.stats.posts],
              ["Replies", data.stats.messages],
              ["Open reports", data.stats.reportsOpen],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  {label}
                </p>
                <p className="mt-1 font-display text-2xl tabular-nums text-[var(--foreground)]">
                  {value}
                </p>
              </div>
            ))}
          </section>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Link
              href="/owner"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-base)] px-3 py-1.5 font-semibold hover:border-[var(--accent)]"
            >
              Metrics <ExternalLink className="h-3 w-3" />
            </Link>
            <Link
              href="/keeper"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-base)] px-3 py-1.5 font-semibold hover:border-[var(--accent)]"
            >
              Moderation <ExternalLink className="h-3 w-3" />
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-base)] px-3 py-1.5 font-semibold hover:border-[var(--accent)]"
            >
              Voices <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <section className="mt-6 rounded-2xl border border-[var(--border-base)] p-4">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">Sentiment</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Aggregate mood only — grouped by feeling and day, never by person.
            </p>

            <p className="mt-3 text-xs text-[var(--muted)]">
              Today: <span className="font-semibold text-[var(--foreground)]">{data.sentiment.today.total}</span>{" "}
              takes with a feeling
              {data.sentiment.today.buckets[0] &&
                ` · most common right now: ${data.sentiment.today.buckets[0].short}`}
            </p>

            <div className="mt-3 space-y-2">
              {data.sentiment.last7d.buckets.length === 0 && (
                <p className="text-xs text-[var(--muted)]">Not enough data yet.</p>
              )}
              {data.sentiment.last7d.buckets.map((b) => (
                <div key={b.id}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--foreground)]">{b.short}</span>
                    <span className="text-[var(--muted)]">
                      {b.count} · {b.pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${b.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Last 14 days — dominant feeling per day
            </p>
            <div className="mt-2 flex items-end gap-1">
              {data.sentiment.daily.map((d) => (
                <div
                  key={d.day}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${d.day}: ${d.dominant ? `${d.dominant.short} (${d.dominant.count})` : "no data"}`}
                >
                  <div
                    className="w-full rounded-t bg-[var(--accent)]"
                    style={{
                      height: `${Math.max(4, Math.min(40, d.total * 4))}px`,
                      opacity: d.dominant ? 1 : 0.15,
                    }}
                  />
                  <span className="text-[9px] text-[var(--muted)]">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--border-base)] p-4">
            <h2 className="text-sm font-semibold">Site switches</h2>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Maintenance mode (blocks new shares vibe)</span>
                <input
                  type="checkbox"
                  checked={data.settings.maintenance}
                  onChange={(e) =>
                    void act("settings", {
                      maintenance: e.target.checked,
                      maintenanceMessage: maintMsg,
                    })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Invites open</span>
                <input
                  type="checkbox"
                  checked={data.settings.invitesOpen}
                  onChange={(e) => void act("settings", { invitesOpen: e.target.checked })}
                />
              </label>
              <div>
                <label className="text-xs text-[var(--muted)]">Maintenance message</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={maintMsg}
                    onChange={(e) => setMaintMsg(e.target.value)}
                    className="flex-1 rounded-xl border border-[var(--border-base)] bg-transparent px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy === "settings"}
                    onClick={() =>
                      void act("settings", {
                        maintenance: data.settings.maintenance,
                        maintenanceMessage: maintMsg,
                      })
                    }
                    className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--surface)]"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--border-base)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Seed feed</h2>
              <button
                type="button"
                disabled={busy === "seed"}
                onClick={() => {
                  if (window.confirm("Insert missing seed takes into the live feed?")) {
                    void act("seed");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--surface)] disabled:opacity-50"
              >
                <Sprout className="h-3.5 w-3.5" />
                {busy === "seed" ? "Seeding…" : "Seed missing takes"}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Idempotent — only adds catalog takes that aren’t already live.
            </p>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--border-base)] p-4">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-sky-600" />
              <h2 className="text-sm font-semibold">Verified accounts</h2>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {data.verifiedUsers.length === 0 && (
                <li className="text-[var(--muted)]">No verified accounts yet.</li>
              )}
              {data.verifiedUsers.map((h) => (
                <li key={h} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 text-sky-600" />
                    {h}
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"
                    onClick={() => void act("unverify_user", { handle: h })}
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                    Remove check
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!verifiedInput.trim()) return;
                void act("verify_user", { handle: verifiedInput.trim() }).then(() =>
                  setVerifiedInput("")
                );
              }}
            >
              <input
                value={verifiedInput}
                onChange={(e) => setVerifiedInput(e.target.value)}
                placeholder="@handle"
                className="flex-1 rounded-xl border border-[var(--border-base)] bg-transparent px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-base)] px-3 py-2 text-xs font-semibold"
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                Verify
              </button>
            </form>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--border-base)] p-4">
            <h2 className="text-sm font-semibold">Low-trust reporters</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Three or more child-safety reports rejected by keepers in 90 days. Their reports are still
              queued, but no longer hide a take on their own.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {(data.lowTrustReporters ?? []).length === 0 && (
                <li className="text-[var(--muted)]">None.</li>
              )}
              {(data.lowTrustReporters ?? []).map((r) => (
                <li key={r.handle}>
                  {r.handle}{" "}
                  <span className="text-xs text-[var(--muted)]">
                    {r.rejected_90d} rejected · {r.upheld} upheld
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--border-base)] p-4">
            <h2 className="text-sm font-semibold">Keepers (moderation)</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {data.keepers.length === 0 && (
                <li className="text-[var(--muted)]">No keepers yet.</li>
              )}
              {data.keepers.map((h) => (
                <li key={h} className="flex items-center justify-between gap-2">
                  <span>{h}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-700"
                    onClick={() => void act("remove_keeper", { handle: h })}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!keeperInput.trim()) return;
                void act("add_keeper", { handle: keeperInput.trim() }).then(() =>
                  setKeeperInput("")
                );
              }}
            >
              <input
                value={keeperInput}
                onChange={(e) => setKeeperInput(e.target.value)}
                placeholder="@handle"
                className="flex-1 rounded-xl border border-[var(--border-base)] bg-transparent px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-base)] px-3 py-2 text-xs font-semibold"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add
              </button>
            </form>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--border-base)] p-4">
            <h2 className="text-sm font-semibold">Admins (global)</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {data.admins.map((a) => (
                <li key={`${a.source}-${a.handle}`} className="flex items-center justify-between gap-2">
                  <span>
                    {a.handle}{" "}
                    <span className="text-[10px] uppercase text-[var(--muted)]">{a.source}</span>
                  </span>
                  {a.source === "db" ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-700"
                      onClick={() => void act("remove_admin", { handle: a.handle })}
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="text-[10px] text-[var(--muted)]">env</span>
                  )}
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!adminInput.trim()) return;
                void act("add_admin", { handle: adminInput.trim() }).then(() => setAdminInput(""));
              }}
            >
              <input
                value={adminInput}
                onChange={(e) => setAdminInput(e.target.value)}
                placeholder="@handle"
                className="flex-1 rounded-xl border border-[var(--border-base)] bg-transparent px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-base)] px-3 py-2 text-xs font-semibold"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add
              </button>
            </form>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--border-base)] p-4">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">Audit log</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Every admin/keeper grant, revoke, and settings change — so a leaked secret or session
              leaves a trail.
            </p>
            <ul className="mt-3 space-y-2 text-xs">
              {data.auditLog.length === 0 && (
                <li className="text-[var(--muted)]">No events yet.</li>
              )}
              {data.auditLog.map((e) => (
                <li key={e.id} className="border-b border-[var(--border-base)] pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--foreground)]">{e.action}</span>
                    <span className="text-[var(--muted)]">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[var(--muted)]">
                    {e.actor_handle ?? "unknown"} · via {e.via}
                    {e.ip ? ` · ${e.ip}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--border-base)] p-4">
            <h2 className="text-sm font-semibold">Recent takes</h2>
            <ul className="mt-3 space-y-3">
              {data.recentPosts.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start justify-between gap-3 border-b border-[var(--border-base)] pb-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--foreground)]">
                      {p.author}{" "}
                      <span className="font-normal text-[var(--muted)]">{p.handle}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-[var(--muted)]">{p.content}</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--surface-2)]"
                    onClick={() =>
                      void act("settings", {
                        featuredPostId: data.settings.featuredPostId === p.id ? "" : p.id,
                      })
                    }
                  >
                    {data.settings.featuredPostId === p.id ? "Unfeature" : "Feature"}
                  </button>
                  <button
                    type="button"
                    title="Delete take"
                    className="shrink-0 rounded-lg p-2 text-rose-700 hover:bg-rose-50"
                    onClick={() => {
                      if (window.confirm("Delete this take for everyone?")) {
                        void act("delete_post", { postId: p.id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
