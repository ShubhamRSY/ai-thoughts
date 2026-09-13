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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type AdminData = {
  you: { handle: string; displayName: string };
  stats: { users: number; posts: number; messages: number; reportsOpen: number };
  settings: {
    maintenance: boolean;
    maintenanceMessage: string;
    invitesOpen: boolean;
  };
  admins: { handle: string; source: "env" | "db" }[];
  keepers: string[];
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
        <h1 className="mt-4 font-display text-2xl font-medium">No admin access</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Signed in as <span className="font-semibold text-[var(--foreground)]">{user.handle}</span>.
          Add this handle to <code className="text-xs">ADMIN_HANDLES</code> on Vercel, or bootstrap
          once with your cron/owner secret.
        </p>
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

          <section className="mt-8 rounded-2xl border border-[var(--border-base)] p-4">
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
