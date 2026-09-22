import Link from "next/link";
import type { Metadata } from "next";
import { connectToDatabase } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trust & moderation — AI·Thoughts",
  description: "What people reported and what we removed in the last 7 days, in plain numbers.",
};

const WEEK_MS = 7 * 864e5;

// Numbers only, never content or handles. The keeper roster stays private on
// purpose (see /api/keepers) — knowing who moderates makes them a target.
async function loadWeek() {
  try {
    const { db } = await connectToDatabase();
    const since = new Date(Date.now() - WEEK_MS);
    const [received, resolved, adminRemovals, keepers] = await Promise.all([
      db.collection("reports").countDocuments({ created_at: { $gte: since } }),
      db
        .collection("reports")
        .aggregate<{ _id: string; n: number }>([
          { $match: { resolved_at: { $gte: since } } },
          { $group: { _id: "$resolution", n: { $sum: 1 } } },
        ])
        .toArray(),
      db.collection("security_audit_log").countDocuments({ action: "delete_post", created_at: { $gte: since } }),
      db.collection("keepers").countDocuments(),
    ]);
    const by = (k: string) => resolved.find((r) => r._id === k)?.n ?? 0;
    return {
      received,
      removed: by("remove") + adminRemovals,
      leftUp: by("dismiss") + by("ignore"),
      keepers,
    };
  } catch {
    return null;
  }
}

export default async function TrustPage() {
  const week = await loadWeek();
  const rows = week && [
    ["Reports received", week.received],
    ["Takes removed", week.removed],
    ["Reviewed and left up", week.leftUp],
  ] as const;

  return (
    <div className="app-rail min-h-dvh py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">Trust &amp; moderation</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        People review every report — here is what happened in the last 7 days.
      </p>

      {rows ? (
        <>
          <dl className="mt-6 grid grid-cols-3 gap-3">
            {rows.map(([label, n]) => (
              <div key={label} className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
                <dd className="font-display text-2xl font-semibold tabular-nums text-[var(--foreground)]">{n}</dd>
                <dt className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-[var(--muted)]">
            {week.keepers} human keeper{week.keepers === 1 ? "" : "s"} review reports. We keep their names
            private so they can do the job without being targeted.
          </p>
        </>
      ) : (
        <p className="mt-6 text-sm text-[var(--muted)]">This week’s numbers are unavailable right now.</p>
      )}

      <p className="mt-6 text-sm text-[var(--muted)]">
        Report something with ··· on any take. See the{" "}
        <Link href="/guidelines" className="underline underline-offset-2 hover:text-[var(--foreground)]">
          guidelines
        </Link>{" "}
        for what we remove.
      </p>
    </div>
  );
}
