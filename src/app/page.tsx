import Link from "next/link";
import Footer from "@/components/Footer";
import BrandMark from "@/components/BrandMark";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { getPulseStats } from "@/lib/pulse-stats";

export const revalidate = 60;

export default async function LandingPage() {
  const { total, samples } = await getPulseStats();

  return (
    <div className="relative flex min-h-dvh w-full flex-col">
      <main className="shell-raw flex flex-1 flex-col px-[var(--shell-pad)] pb-12 pt-14">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]">
          <BrandMark className="h-8 w-8" />
        </div>

        <h1 className="font-display mt-8 text-4xl font-medium leading-[1.15] tracking-tight text-[var(--foreground)] sm:text-5xl">
          AI·Thoughts
        </h1>
        <p className="mt-3 max-w-[22ch] text-lg leading-snug text-[var(--muted)]">
          How people really feel about AI — in their own voice.
        </p>
        <p className="mt-4 text-sm text-[var(--muted)]">
          {total < 25
            ? "Be one of the first voices."
            : `${total.toLocaleString()} voices on the pulse.`}
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {FEELINGS.slice(0, 5).map((f) => (
            <span
              key={f.id}
              className="rounded-full border border-[var(--border-base)] px-3 py-1 text-xs text-[var(--muted)]"
            >
              {f.short}
            </span>
          ))}
        </div>

        <div className="mt-10 space-y-0 border-t border-[var(--border-base)]">
          {samples.map((s) => {
            const meta = feelingOf(s.feeling ?? undefined);
            return (
              <blockquote
                key={s.id}
                className="border-b border-[var(--border-base)] py-5"
              >
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

        <div className="mt-10">
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
          >
            Join the pulse
          </Link>
          <p className="mt-3 text-xs text-[var(--muted)]">Email code · no password</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
