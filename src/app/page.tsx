import Link from "next/link";
import Footer from "@/components/Footer";
import BrandMark from "@/components/BrandMark";
import { getPulseStats } from "@/lib/pulse-stats";
import { getSession } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [{ total }, session] = await Promise.all([
    getPulseStats(),
    getSession(),
  ]);

  const ctaHref = session ? "/app" : "/sign-in";
  const ctaLabel = session ? BRAND.openCta : BRAND.joinCta;

  return (
    <div className="app-frame">
      <main className="app-pad flex flex-1 flex-col pb-12 pt-14">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]">
          <BrandMark className="h-8 w-8" />
        </div>

        <h1 className="font-display mt-8 text-4xl font-medium leading-[1.15] tracking-tight text-[var(--foreground)] sm:text-5xl">
          {BRAND.name}
        </h1>
        <p className="mt-3 max-w-[22ch] text-xl font-medium leading-snug text-[var(--foreground)] sm:max-w-[28ch] sm:text-2xl">
          {BRAND.tagline}
        </p>
        <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-[var(--muted)]">
          {BRAND.promise}
        </p>
        <p className="mt-4 text-sm text-[var(--muted)]">
          {session
            ? `Welcome back${session.displayName ? `, ${session.displayName}` : ""}.`
            : total < 25
              ? "Be one of the first to say how AI feels."
              : `${total.toLocaleString()} people already expressing themselves.`}
        </p>

        <div className="mt-8">
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
          >
            {ctaLabel}
          </Link>
          {!session && (
            <p className="mt-3 text-xs text-[var(--muted)]">Email code · no password</p>
          )}
        </div>

        <section className="mt-12 border-t border-[var(--border-base)] pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            What you do here
          </p>
          <ol className="mt-4 space-y-5">
            {BRAND.whatYouDo.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-2)]">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{step.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {!session && (
          <div className="mt-10">
            <Link
              href={ctaHref}
              className="inline-flex w-full items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)] sm:w-auto"
            >
              {ctaLabel}
            </Link>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
