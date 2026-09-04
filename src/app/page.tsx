import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import Footer from "@/components/Footer";
import BrandMark from "@/components/BrandMark";

const FEELINGS = [
  { label: "Worried", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { label: "Hopeful", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { label: "Curious", color: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { label: "Excited", color: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  { label: "Overwhelmed", color: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
];

export default function LandingPage() {
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

      <main className="relative z-10 mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center px-6 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-xl shadow-violet-500/30">
            <BrandMark className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
            AI·Thoughts
          </h1>
          <p className="mt-2 text-sm text-zinc-500">The Public Pulse</p>
          <p className="mt-4 max-w-xs text-balance text-sm leading-relaxed text-zinc-400">
            How people really feel about AI — told in their own voice.
            Raw, honest, all ages. <span className="text-zinc-300">It&apos;s okay to feel bad about AI too.</span>
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {FEELINGS.map((f) => (
            <span
              key={f.label}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${f.color}`}
            >
              {f.label}
            </span>
          ))}
        </div>

        {/* A real take, not a marketing icon — this is what the pulse looks like */}
        <div className="mb-7 rounded-2xl border border-zinc-800/70 bg-[#141419]/95 p-4 shadow-sm shadow-black/20 ring-1 ring-inset ring-white/[0.03]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-xs font-bold text-white">
              MV
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-semibold text-zinc-200">Mara Voss</p>
              <p className="text-[11px] text-zinc-500">@maravoss · 1d</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300">
              🤖 Use it daily
            </span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">
            &ldquo;Honestly, Copilot&apos;s autocompletion is SO sleek when you&apos;re in flow.
            But then you paste the same snippet in the wrong file and it politely
            gaslights you.&rdquo;
          </p>
          <div className="mt-3 flex items-center gap-3 border-t border-zinc-800/70 pt-3 text-zinc-500">
            <span className="flex items-center gap-1 text-xs">
              <Flame className="h-3.5 w-3.5 text-orange-400" /> 12 feel this too
            </span>
            <span className="text-xs">💬 4</span>
            <span className="ml-auto text-[10px] text-emerald-400">✓ unmodified</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/sign-in"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 active:scale-[0.98]"
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
