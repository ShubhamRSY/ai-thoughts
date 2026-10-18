import Link from "next/link";
import type { Metadata } from "next";
import { getPublicPulse } from "@/lib/public-pulse";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { BRAND } from "@/lib/brand";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live pulse — how people feel about AI | AiTo",
  description:
    "The live public pulse on AI: which feelings dominate right now, in people's own words. Voice, video, and text takes from real humans — no debates, no tips.",
  alternates: { canonical: "/pulse" },
  openGraph: {
    title: "Live pulse — how people feel about AI | AiTo",
    description:
      "Which feelings dominate right now? See the live public pulse on AI — real takes from real people.",
    url: "/pulse",
  },
};

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m) || m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default async function PulsePage() {
  const pulse = await getPublicPulse();
  const dominant = pulse.dominant && feelingOf(pulse.dominant.id);
  const siteUrl = getSiteUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Live pulse on AI",
    description: `How people feel about AI right now — ${pulse.total} check-ins this week.`,
    url: `${siteUrl}/pulse`,
    isPartOf: { "@type": "WebSite", name: BRAND.name, url: siteUrl },
  };

  return (
    <div className="app-rail min-h-dvh py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        The public pulse
      </p>
      <h1 className="font-display mt-1 text-2xl font-bold text-[var(--foreground)]">
        How people feel about AI — right now
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {pulse.total > 0 ? (
          <>
            <span className="font-semibold text-[var(--foreground)]">{pulse.total.toLocaleString()}</span>{" "}
            check-ins this week from {pulse.authorCount.toLocaleString()}{" "}
            {pulse.authorCount === 1 ? "person" : "people"}.
          </>
        ) : (
          "The pulse is quiet right now — be among the first to add your feeling."
        )}
        {dominant && (
          <>
            {" "}
            Right now the dominant feeling is{" "}
            <span className="font-semibold text-[var(--foreground)]">{dominant.label.toLowerCase()}</span>.
          </>
        )}
      </p>

      {/* Feeling tally — each links to its own page */}
      {pulse.tally.length > 0 && (
        <section className="mt-6" aria-label="Feeling breakdown">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            What people feel this week
          </h2>
          <ul className="mt-3 space-y-2">
            {pulse.tally.map((row) => {
              const f = feelingOf(row.id);
              if (!f) return null;
              const pct = pulse.total > 0 ? Math.round((row.count / pulse.total) * 100) : 0;
              return (
                <li key={row.id}>
                  <Link
                    href={`/pulse/${row.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--foreground)] group-hover:text-[var(--accent-2)]">
                        {f.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                        {row.count.toLocaleString()} {row.count === 1 ? "check-in" : "check-ins"} · {pct}%
                      </span>
                    </span>
                    <span
                      className="h-2 shrink-0 rounded-full bg-[var(--accent)]"
                      style={{ width: `${Math.max(8, pct)}%`, maxWidth: "40%" }}
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Recent public takes — text excerpts */}
      {pulse.samples.length > 0 && (
        <section className="mt-8" aria-label="Recent takes">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Recent voices
          </h2>
          <ul className="mt-3 space-y-3">
            {pulse.samples.map((take) => {
              const f = take.feeling ? feelingOf(take.feeling) : undefined;
              return (
                <li
                  key={take.id}
                  className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                    <span className="font-medium text-[var(--foreground)]">{take.author}</span>
                    {f && (
                      <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 font-semibold">
                        {f.short}
                      </span>
                    )}
                    <span className="ml-auto">{timeAgo(take.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">{take.content}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-[var(--border-base)] bg-[var(--accent-soft)]/30 p-5">
        <h2 className="font-display text-lg font-semibold text-[var(--foreground)]">
          How does AI make <em>you</em> feel?
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick a feeling, then say why — in voice, video, or a few words. No sign-up to read;
          an email code (no password) when you share.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/app"
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
          >
            Hear what people feel
          </Link>
          <Link
            href="/sign-in"
            className="rounded-full border border-[var(--border-base)] px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
          >
            Share your feeling
          </Link>
        </div>
      </section>

      {/* All feelings, even at zero — a map of the emotional space */}
      <section className="mt-8" aria-label="All feelings">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          All feelings
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {FEELINGS.map((f) => (
            <Link
              key={f.id}
              href={`/pulse/${f.id}`}
              className="rounded-full border border-[var(--border-base)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
            >
              {f.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
