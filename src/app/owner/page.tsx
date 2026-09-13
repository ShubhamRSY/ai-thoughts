"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OwnerMetrics } from "@/lib/owner-metrics";

const SECRET_KEY = "aithoughts.owner.secret";

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

function Delta({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-[var(--muted)]">n/a</span>;
  }
  const up = value > 0;
  const down = value < 0;
  return (
    <span
      className={`text-xs font-semibold tabular-nums ${
        up
          ? "text-[var(--accent)]"
          : down
            ? "text-rose-700"
            : "text-[var(--muted)]"
      }`}
    >
      {fmtPct(value)}
    </span>
  );
}

function Stat({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          {label}
        </p>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <p className="mt-1 font-display text-2xl font-medium tabular-nums text-[var(--foreground)]">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function SparkBars({
  series,
  label,
}: {
  series: { day: string; count: number }[];
  label: string;
}) {
  const max = Math.max(1, ...series.map((d) => d.count));
  const total = series.reduce((s, d) => s + d.count, 0);
  return (
    <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            {label}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {total} total · last {series.length} days
          </p>
        </div>
      </div>
      <div className="mt-4 flex h-28 items-end gap-1">
        {series.map((d) => {
          const h = Math.max(d.count === 0 ? 2 : 8, (d.count / max) * 100);
          return (
            <div key={d.day} className="group relative flex min-w-0 flex-1 flex-col justify-end">
              <div
                className="w-full rounded-sm bg-[var(--accent)]/85 transition group-hover:bg-[var(--accent)]"
                style={{ height: `${h}%` }}
                title={`${d.day}: ${d.count}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-[var(--muted)]">
        <span>{series[0]?.day.slice(5)}</span>
        <span>{series[series.length - 1]?.day.slice(5)}</span>
      </div>
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

  const funnelMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, data.funnel_7d.users, data.funnel_7d.posters, data.funnel_7d.engaged);
  }, [data]);

  const trendLabel =
    data?.trend.direction === "up"
      ? "Scaling up"
      : data?.trend.direction === "down"
        ? "Cooling down"
        : data?.trend.direction === "flat"
          ? "Holding steady"
          : "Early / unclear";

  return (
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Product owner · private analytics
            </p>
            <h1 className="font-display mt-2 text-3xl font-medium tracking-tight">
              Voices pulse
            </h1>
            <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-[var(--muted)]">
              Growth, warmth, and ritual health — not shown to members. Unlock with{" "}
              <code className="text-xs">OWNER_DASHBOARD_SECRET</code> or{" "}
              <code className="text-xs">CRON_SECRET</code>.
            </p>
          </div>
          {data && (
            <button
              type="button"
              onClick={() => void load(secret || draft)}
              disabled={loading}
              className="rounded-full border border-[var(--border-base)] px-4 py-2 text-xs font-semibold hover:border-[var(--accent)] disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh data"}
            </button>
          )}
        </div>

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
            {loading ? "Loading…" : data ? "Reload" : "Unlock"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

        {data && (
          <div className="mt-8 space-y-8">
            {/* Health hero */}
            <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] px-5 py-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Platform health
                </p>
                <div className="mt-3 flex items-end gap-4">
                  <p className="font-display text-5xl font-medium tabular-nums text-[var(--accent)]">
                    {data.health.score}
                  </p>
                  <div className="pb-1">
                    <p className="text-lg font-semibold">
                      {data.health.grade} · {data.health.label}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{data.health.summary}</p>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${data.health.score}%` }}
                  />
                </div>
                <p className="mt-4 text-sm font-medium text-[var(--foreground)]">
                  {trendLabel}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                  <span>
                    Takes WoW <Delta value={data.trend.posts_wow_pct} />
                  </span>
                  <span>
                    Users WoW <Delta value={data.trend.users_wow_pct} />
                  </span>
                  <span>
                    Engagement WoW <Delta value={data.trend.engagement_wow_pct} />
                  </span>
                  <span>
                    Posters WoW <Delta value={data.trend.posters_wow_pct} />
                  </span>
                </div>
                <p className="mt-3 text-[11px] text-[var(--muted)]">
                  Updated {new Date(data.generated_at).toLocaleString()}
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] px-5 py-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  What to do next
                </p>
                <ul className="mt-3 space-y-2.5">
                  {data.insights.map((line) => (
                    <li
                      key={line}
                      className="border-l-2 border-[var(--accent)] pl-3 text-sm leading-relaxed text-[var(--foreground)]"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Today vs yesterday */}
            <section>
              <h2 className="text-sm font-semibold">Today vs yesterday</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Takes today"
                  value={data.today.posts}
                  delta={data.rates.posts_dod_pct}
                  hint={`Yesterday ${data.yesterday.posts}`}
                />
                <Stat
                  label="Prompt answers"
                  value={data.today.prompt_answers}
                  hint={`Yesterday ${data.yesterday.prompt_answers}`}
                />
                <Stat
                  label="Reactions"
                  value={data.today.reactions}
                  hint={`Yesterday ${data.yesterday.reactions}`}
                />
                <Stat
                  label="Replies"
                  value={data.today.replies}
                  hint={`Yesterday ${data.yesterday.replies}`}
                />
              </div>
            </section>

            {/* 7d KPIs */}
            <section>
              <h2 className="text-sm font-semibold">Last 7 days</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Stat
                  label="Takes"
                  value={data.last_7d.posts}
                  delta={data.trend.posts_wow_pct}
                  hint={`Prior week ${data.prior_7d.posts}`}
                />
                <Stat
                  label="Unique posters"
                  value={data.last_7d.unique_posters}
                  delta={data.trend.posters_wow_pct}
                  hint={`Prior week ${data.prior_7d.unique_posters}`}
                />
                <Stat
                  label="Returning posters"
                  value={data.last_7d.returning_posters}
                  hint="Posted on 2+ days"
                />
                <Stat
                  label="New users"
                  value={data.last_7d.new_users}
                  delta={data.trend.users_wow_pct}
                  hint={`Prior week ${data.prior_7d.new_users}`}
                />
                <Stat label="Reactions" value={data.last_7d.reactions} />
                <Stat label="Replies" value={data.last_7d.replies} />
                <Stat label="New feel-with" value={data.last_7d.new_follows} />
                <Stat label="Prompt answers" value={data.last_7d.prompt_answers} />
              </div>
            </section>

            {/* Rates */}
            <section>
              <h2 className="text-sm font-semibold">Engagement quality (7d)</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Stat
                  label="Reactions / take"
                  value={data.rates.reactions_per_post_7d}
                  hint="Warmth signal"
                />
                <Stat
                  label="Replies / take"
                  value={data.rates.replies_per_post_7d}
                  hint="Conversation depth"
                />
                <Stat
                  label="Prompt share"
                  value={`${data.rates.prompt_share_of_posts_7d}%`}
                  hint="Ritual adherence"
                />
                <Stat
                  label="Posters / users"
                  value={`${data.rates.poster_share_of_users_7d}%`}
                  hint="Creation rate"
                />
                <Stat
                  label="Push opt-in"
                  value={`${data.rates.push_opt_in_pct}%`}
                  hint="Of all users"
                />
              </div>
            </section>

            {/* Charts */}
            <section className="grid gap-4 lg:grid-cols-2">
              <SparkBars series={data.posts_by_day} label="Takes per day" />
              <SparkBars series={data.users_by_day} label="New users per day" />
            </section>

            {/* Funnel + media */}
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Funnel (7d activity vs all users)
                </p>
                <div className="mt-4 space-y-3">
                  {(
                    [
                      ["All users", data.funnel_7d.users],
                      ["Posted (7d)", data.funnel_7d.posters],
                      ["Engaged (7d)", data.funnel_7d.engaged],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{label}</span>
                        <span className="tabular-nums font-semibold">{value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--surface-2)]">
                        <div
                          className="h-2 rounded-full bg-[var(--accent)]"
                          style={{
                            width: `${Math.max(4, (value / funnelMax) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Engaged = posted, reacted, or replied in the last 7 days.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Format mix (7d)
                </p>
                {data.media_7d.length === 0 ? (
                  <p className="mt-4 text-sm text-[var(--muted)]">No takes yet.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {data.media_7d.map((m) => (
                      <li key={m.type}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="capitalize">{m.type}</span>
                          <span className="tabular-nums">
                            {m.count} · {m.pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--surface-2)]">
                          <div
                            className="h-2 rounded-full bg-[var(--accent)]"
                            style={{ width: `${Math.max(4, m.pct)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Feelings + posters */}
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)]">
                <div className="border-b border-[var(--border-base)] px-4 py-3">
                  <p className="text-sm font-semibold">Feelings (7d)</p>
                </div>
                {data.feelings_7d.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-[var(--muted)]">No felt takes yet.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border-base)]">
                    {data.feelings_7d.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{f.short}</p>
                          <p className="truncate text-xs text-[var(--muted)]">{f.label}</p>
                        </div>
                        <div className="text-right">
                          <p className="tabular-nums text-sm font-semibold">{f.count}</p>
                          <p className="text-[11px] text-[var(--muted)]">{f.pct}%</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)]">
                <div className="border-b border-[var(--border-base)] px-4 py-3">
                  <p className="text-sm font-semibold">Most active posters (7d)</p>
                </div>
                {data.top_posters_7d.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-[var(--muted)]">No posters yet.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border-base)]">
                    {data.top_posters_7d.map((p, i) => (
                      <li
                        key={p.handle}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-5 text-xs tabular-nums text-[var(--muted)]">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{p.author}</p>
                            <p className="truncate text-xs text-[var(--muted)]">{p.handle}</p>
                          </div>
                        </div>
                        <span className="tabular-nums text-sm font-semibold">{p.posts}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Totals */}
            <section>
              <h2 className="text-sm font-semibold">All-time base</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Users" value={data.totals.users} />
                <Stat label="Takes" value={data.totals.posts} />
                <Stat label="Reactions" value={data.totals.reactions} />
                <Stat label="Replies" value={data.totals.replies} />
                <Stat label="Feel-with" value={data.totals.follows} />
                <Stat label="Push subs" value={data.totals.push_subscriptions} />
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                30d: {data.last_30d.posts} takes · {data.last_30d.unique_posters} posters ·{" "}
                {data.last_30d.new_users} new users
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
