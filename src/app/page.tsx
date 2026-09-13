import Link from "next/link";
import Footer from "@/components/Footer";
import BrandMark from "@/components/BrandMark";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { getPulseStats } from "@/lib/pulse-stats";
import { getSession } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [{ total, samples }, session] = await Promise.all([
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

        <section className="mt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Feelings you can name
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {FEELINGS.map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3.5 py-2.5"
              >
                <p className="text-sm font-semibold text-[var(--foreground)]">{f.short}</p>
                <p className="text-xs text-[var(--muted)]">{f.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 border-t border-[var(--border-base)] pt-2">
          <p className="pt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Voices already speaking
          </p>
          <div className="mt-2 space-y-0">
            {samples.map((s) => {
              const meta = feelingOf(s.feeling ?? undefined);
              return (
                <blockquote key={s.id} className="border-b border-[var(--border-base)] py-5">
                  {meta && (
                    <p className="mb-1.5 text-xs font-medium text-[var(--accent)]">{meta.label}</p>
                  )}
                  <p className="font-display text-base leading-relaxed text-[var(--foreground)]">
                    “{s.content}”
                  </p>
                  <footer className="mt-2 text-xs text-[var(--muted)]">
                    {s.author}
                    {meta ? ` · ${meta.short}` : ""}
                    {s.timeLabel ? ` · ${s.timeLabel}` : ""}
                  </footer>
                </blockquote>
              );
            })}
          </div>
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
