import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import Footer from "@/components/Footer";
import BrandMark from "@/components/BrandMark";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { getPulseStats } from "@/lib/pulse-stats";

export const revalidate = 60;

const AVATAR_TONES = [
  "from-teal-500 to-cyan-600",
  "from-sky-500 to-blue-600",
  "from-amber-500 to-orange-500",
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
}

export default async function LandingPage() {
  const { total, samples } = await getPulseStats();

  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden">
      <main className="shell-frame @container relative z-10 flex-1 !border-0 !bg-transparent px-[var(--shell-pad)] pb-8 pt-10 sm:!shadow-none">
        <div className="landing-grid flex-1">
          <div className="flex flex-col items-center text-center @[40rem]/items-start @[40rem]/text-left">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]">
              <BrandMark className="h-10 w-10" />
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
              AI·Thoughts
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">The Public Pulse</p>
            <p className="mt-3 max-w-md text-balance text-sm leading-relaxed text-[var(--muted)] sm:text-base">
              How people really feel about AI — told in their own voice.
              Raw, honest, all ages.{" "}
              <span className="text-[var(--foreground)]">It&apos;s okay to feel bad about AI too.</span>
            </p>

            <div className="mt-4 flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3.5 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
              </span>
              <span className="text-xs font-medium text-teal-800">
                {total < 25
                  ? "Be one of the first voices on the pulse"
                  : `${total.toLocaleString()} voices on the pulse right now`}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 @[40rem]/justify-start">
              {FEELINGS.map((f) => (
                <span
                  key={f.id}
                  className={`animate-pop-in rounded-lg border px-2.5 py-1 text-xs font-medium ${f.chip}`}
                >
                  {f.emoji} {f.short}
                </span>
              ))}
            </div>

            <div className="mt-8 flex w-full max-w-md flex-col gap-3">
              <Link
                href="/sign-in"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-[0.98]"
              >
                Join the pulse
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <p className="text-center text-[11px] text-[var(--muted)] @[40rem]:text-left">
                Just your email — no password, no spam.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {samples.map((s, i) => {
              const meta = feelingOf(s.feeling ?? undefined);
              return (
                <div
                  key={s.id}
                  style={{ animationDelay: `${i * 90}ms`, animationFillMode: "backwards" }}
                  className="animate-rise-in rounded-2xl border border-[var(--border-base)] bg-white p-4 shadow-sm shadow-slate-900/5"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${AVATAR_TONES[i % AVATAR_TONES.length]}`}
                    >
                      {initialsOf(s.author)}
                    </div>
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-xs font-semibold text-[var(--foreground)]">{s.author}</p>
                      <p className="text-[11px] text-[var(--muted)]">{s.handle} · {s.timeLabel}</p>
                    </div>
                    {meta && (
                      <span className={`ml-auto shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}>
                        {meta.emoji} {meta.short}
                      </span>
                    )}
                  </div>
                  <p dir="auto" className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-[var(--foreground)]">
                    &ldquo;{s.content}&rdquo;
                  </p>
                  {i === 0 && (
                    <div className="mt-3 flex items-center gap-3 border-t border-[var(--border-base)] pt-3 text-[var(--muted)]">
                      <span className="flex items-center gap-1 text-xs">
                        <Flame className="h-3.5 w-3.5 text-orange-500" /> people feel this too
                      </span>
                      <span className="ml-auto text-[10px] text-emerald-700">✓ unmodified</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
