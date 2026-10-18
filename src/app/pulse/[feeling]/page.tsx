import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { getFeelingTakes, isFeelingId } from "@/lib/public-pulse";
import { BRAND } from "@/lib/brand";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ feeling: string }>;
}): Promise<Metadata> {
  const { feeling } = await params;
  if (!isFeelingId(feeling)) return {};
  const f = feelingOf(feeling);
  if (!f) return {};
  return {
    title: `People who feel “${f.short}” about AI | AiTo`,
    description: `Real takes from people who ${f.label.toLowerCase()} — how AI makes them feel, in their own words. Part of the live public pulse on AI.`,
    alternates: { canonical: `/pulse/${feeling}` },
    openGraph: {
      title: `People who feel “${f.short}” about AI | AiTo`,
      description: `Real takes from people who ${f.label.toLowerCase()} — in their own words.`,
      url: `/pulse/${feeling}`,
    },
  };
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m) || m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default async function FeelingPulsePage({
  params,
}: {
  params: Promise<{ feeling: string }>;
}) {
  const { feeling } = await params;
  if (!isFeelingId(feeling)) notFound();
  const f = feelingOf(feeling);
  if (!f) notFound();

  const takes = await getFeelingTakes(feeling);
  const siteUrl = getSiteUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `People who feel “${f.short}” about AI`,
    description: `Real takes from people who ${f.label.toLowerCase()} — part of the live public pulse on AI.`,
    url: `${siteUrl}/pulse/${feeling}`,
    isPartOf: { "@type": "WebSite", name: BRAND.name, url: siteUrl },
  };

  return (
    <div className="app-rail min-h-dvh py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav className="text-[11px] text-[var(--muted)]" aria-label="Breadcrumb">
        <Link href="/pulse" className="underline underline-offset-2 hover:text-[var(--foreground)]">
          Live pulse
        </Link>{" "}
        / {f.short}
      </nav>

      <h1 className="font-display mt-2 text-2xl font-bold text-[var(--foreground)]">
        People who {f.label.toLowerCase()}
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {takes.length > 0 ? (
          <>
            <span className="font-semibold text-[var(--foreground)]">{takes.length}</span> recent{" "}
            {takes.length === 1 ? "take" : "takes"} from people who feel this way about AI.
          </>
        ) : (
          "No takes here yet — be the first to share how this feels for you."
        )}{" "}
        Part of the{" "}
        <Link href="/pulse" className="underline underline-offset-2 hover:text-[var(--foreground)]">
          live public pulse
        </Link>
        .
      </p>

      {takes.length > 0 && (
        <ul className="mt-6 space-y-3">
          {takes.map((take) => (
            <li
              key={take.id}
              className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">{take.author}</span>
                <span className="ml-auto">{timeAgo(take.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">{take.content}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8 rounded-2xl border border-[var(--border-base)] bg-[var(--accent-soft)]/30 p-5">
        <h2 className="font-display text-lg font-semibold text-[var(--foreground)]">
          Feel this way too?
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Say it in your own words — voice, video, or a few lines. No debates, no tips.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/app?feeling=${feeling}`}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
          >
            Share this feeling
          </Link>
          <Link
            href="/pulse"
            className="rounded-full border border-[var(--border-base)] px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
          >
            See all feelings
          </Link>
        </div>
      </section>

      <nav className="mt-8 flex flex-wrap gap-2" aria-label="Other feelings">
        {FEELINGS.filter((x) => x.id !== feeling).map((x) => (
          <Link
            key={x.id}
            href={`/pulse/${x.id}`}
            className="rounded-full border border-[var(--border-base)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
          >
            {x.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
