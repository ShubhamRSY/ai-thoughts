import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import Footer from "@/components/Footer";
import BrandMark from "@/components/BrandMark";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { getPulseStats } from "@/lib/pulse-stats";

export const revalidate = 60;

const AVATAR_TONES = [
  "from-sky-500 to-cyan-500",
  "from-fuchsia-500 to-pink-500",
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
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-zinc-950">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #fff 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
        aria-hidden
      />
      <div className="animate-aurora pointer-events-none absolute inset-x-0 top-0 h-96 opacity-40">
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-violet-600/40 to-transparent blur-3xl" />
      </div>
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[100px]" aria-hidden />

      <main className="relative z-10 mx-auto flex w-full max-w-[430px] flex-1 flex-col px-6 pb-8 pt-10">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-xl shadow-violet-500/30">
            <BrandMark className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
            AI·Thoughts
          </h1>
          <p className="mt-2 text-sm text-zinc-500">The Public Pulse</p>
          <p className="mt-3 max-w-xs text-balance text-sm leading-relaxed text-zinc-400">
            How people really feel about AI — told in their own voice.
            Raw, honest, all ages. <span className="text-zinc-300">It&apos;s okay to feel bad about AI too.</span>
          </p>

          <div className="mt-4 flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 px-3.5 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs font-medium text-violet-200">
              {total < 25
                ? "Be one of the first voices on the pulse"
                : `${total.toLocaleString()} voices on the pulse right now`}
            </span>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-center gap-1.5">
          {FEELINGS.map((f) => (
            <span
              key={f.id}
              className={`animate-pop-in rounded-full border px-2.5 py-1 text-xs font-medium ${f.chip}`}
            >
              {f.emoji} {f.short}
            </span>
          ))}
        </div>

        {/* Real takes, not marketing copy — this is what the pulse looks like */}
        <div className="mb-6 flex flex-col gap-3">
          {samples.map((s, i) => {
            const meta = feelingOf(s.feeling ?? undefined);
            return (
              <div
                key={s.id}
                style={{ animationDelay: `${i * 90}ms`, animationFillMode: "backwards" }}
                className="animate-rise-in rounded-2xl border border-zinc-800/70 bg-[#141419]/95 p-4 shadow-sm shadow-black/20 ring-1 ring-inset ring-white/[0.03]"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${AVATAR_TONES[i % AVATAR_TONES.length]}`}
                  >
                    {initialsOf(s.author)}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-xs font-semibold text-zinc-200">{s.author}</p>
                    <p className="text-[11px] text-zinc-500">{s.handle} · {s.timeLabel}</p>
                  </div>
                  {meta && (
                    <span className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}>
                      {meta.emoji} {meta.short}
                    </span>
                  )}
                </div>
                <p dir="auto" className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-zinc-300">
                  &ldquo;{s.content}&rdquo;
                </p>
                {i === 0 && (
                  <div className="mt-3 flex items-center gap-3 border-t border-zinc-800/70 pt-3 text-zinc-500">
                    <span className="flex items-center gap-1 text-xs">
                      <Flame className="h-3.5 w-3.5 text-orange-400" /> people feel this too
                    </span>
                    <span className="ml-auto text-[10px] text-emerald-400">✓ unmodified</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <Link
            href="/sign-in"
            className="animate-shimmer relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 active:scale-[0.98]"
          >
            Join the pulse
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <p className="text-center text-[11px] text-zinc-600">
            Just your email — no password, no spam.
          </p>
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
