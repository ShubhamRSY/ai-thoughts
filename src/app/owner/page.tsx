"use client";

import { useCallback, useEffect, useState } from "react";
import type { OwnerMetrics } from "@/lib/owner-metrics";

const SECRET_KEY = "aithoughts.owner.secret";

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-medium tabular-nums text-[var(--foreground)]">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export default function OwnerDashboardPage() {
  const [secret, setSecret] = useState("");
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<OwnerMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SECRET_KEY);
      if (saved) {
        setSecret(saved);
        setDraft(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async (token: string) => {
    if (!token.trim()) {
      setError("Enter your owner dashboard secret");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/metrics", {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setData(null);
        setError(
          typeof body.error === "string" ? body.error : `Failed (${res.status})`
        );
        return;
      }
      setData(body as OwnerMetrics);
      try {
        sessionStorage.setItem(SECRET_KEY, token.trim());
      } catch {
        /* ignore */
      }
      setSecret(token.trim());
    } catch {
      setError("Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (secret) void load(secret);
  }, [secret, load]);

  const maxDay = data
    ? Math.max(1, ...data.posts_by_day.map((d) => d.count))
    : 1;

  const trendLabel =
    data?.trend.direction === "up"
      ? "Scaling up"
      : data?.trend.direction === "down"
        ? "Cooling down"
        : data?.trend.direction === "flat"
          ? "Holding steady"
          : "Not enough history";

  return (
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          Product owner · private
        </p>
        <h1 className="font-display mt-2 text-3xl font-medium tracking-tight">
          Engagement dashboard
        </h1>
        <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-[var(--muted)]">
          Not part of Voices for members. Bookmark this URL. Unlock with{" "}
          <code className="text-xs">OWNER_DASHBOARD_SECRET</code> (or{" "}
          <code className="text-xs">CRON_SECRET</code>).
        </p>

        <form
          className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void load(draft);
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Dashboard secret
            </span>
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Paste secret"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)] disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-rose-700">{error}</p>
        )}

        {data && (
          <div className="mt-8 space-y-8">
            <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Week-over-week pulse
              </p>
              <p className="font-display mt-1 text-2xl font-medium text-[var(--accent)]">
                {trendLabel}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Posts {fmtPct(data.trend.posts_wow_pct)} · New users{" "}
                {fmtPct(data.trend.users_wow_pct)} vs prior 7 days
              </p>
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                Updated {new Date(data.generated_at).toLocaleString()}
              </p>
            </div>

            <section>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Today</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Takes" value={data.today.posts} />
                <Stat label="Prompt answers" value={data.today.prompt_answers} />
                <Stat label="Unique posters" value={data.today.unique_posters} />
                <Stat label="Reactions" value={data.today.reactions} />
                <Stat label="Replies" value={data.today.replies} />
                <Stat
                  label="vs yesterday takes"
                  value={`${data.yesterday.posts}`}
                  hint="Yesterday’s post count"
                />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Last 7 days</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Takes" value={data.last_7d.posts} />
                <Stat label="Unique posters" value={data.last_7d.unique_posters} />
                <Stat label="New users" value={data.last_7d.new_users} />
                <Stat label="Reactions" value={data.last_7d.reactions} />
                <Stat label="Replies" value={data.last_7d.replies} />
                <Stat label="New feel-with" value={data.last_7d.new_follows} />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">All time</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Users" value={data.totals.users} />
                <Stat label="Takes" value={data.totals.posts} />
                <Stat label="Reactions" value={data.totals.reactions} />
                <Stat label="Replies" value={data.totals.replies} />
                <Stat label="Feel-with links" value={data.totals.follows} />
                <Stat label="Push subs" value={data.totals.push_subscriptions} />
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                30d: {data.last_30d.posts} takes · {data.last_30d.unique_posters}{" "}
                posters · {data.last_30d.new_users} new users
              </p>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                Takes per day (14d)
              </h2>
              <div className="mt-3 space-y-1.5 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
                {data.posts_by_day.map((d) => (
                  <div key={d.day} className="flex items-center gap-3 text-xs">
                    <span className="w-[4.75rem] shrink-0 tabular-nums text-[var(--muted)]">
                      {d.day.slice(5)}
                    </span>
                    <div className="h-2 min-w-0 flex-1 rounded-full bg-[var(--surface-2)]">
                      <div
                        className="h-2 rounded-full bg-[var(--accent)]"
                        style={{ width: `${Math.max(4, (d.count / maxDay) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right tabular-nums font-medium">
                      {d.count}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {data.feelings_7d.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Feelings (7d)
                </h2>
                <ul className="mt-3 divide-y divide-[var(--border-base)] rounded-xl border border-[var(--border-base)] bg-[var(--surface)]">
                  {data.feelings_7d.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{f.short}</p>
                        <p className="truncate text-xs text-[var(--muted)]">{f.label}</p>
                      </div>
                      <span className="tabular-nums text-sm font-semibold">{f.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.top_posters_7d.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Most active (7d)
                </h2>
                <ul className="mt-3 divide-y divide-[var(--border-base)] rounded-xl border border-[var(--border-base)] bg-[var(--surface)]">
                  {data.top_posters_7d.map((p) => (
                    <li
                      key={p.handle}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.author}</p>
                        <p className="truncate text-xs text-[var(--muted)]">{p.handle}</p>
                      </div>
                      <span className="tabular-nums text-sm font-semibold">
                        {p.posts}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
