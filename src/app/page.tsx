import Link from "next/link";
import { BrainCircuit, ArrowRight, Mic, Video, Heart } from "lucide-react";
import Footer from "@/components/Footer";

const FEELINGS = [
  { label: "Worried", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { label: "Hopeful", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { label: "Curious", color: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { label: "Excited", color: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  { label: "Overwhelmed", color: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
];

export default function LandingPage() {
  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden">
      <div className="animate-aurora pointer-events-none absolute inset-x-0 top-0 h-96 opacity-30">
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-violet-600/30 to-transparent blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-xl shadow-violet-500/30">
            <BrainCircuit className="h-8 w-8 text-white" strokeWidth={1.8} />
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

        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {FEELINGS.map((f) => (
            <span
              key={f.label}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${f.color}`}
            >
              {f.label}
            </span>
          ))}
        </div>

        <div className="mb-8 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-3">
            <Mic className="mx-auto mb-1.5 h-4 w-4 text-violet-400" strokeWidth={2} />
            <p className="text-[11px] leading-tight text-zinc-400">Voice &amp; video takes</p>
          </div>
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-3">
            <Heart className="mx-auto mb-1.5 h-4 w-4 text-rose-400" strokeWidth={2} />
            <p className="text-[11px] leading-tight text-zinc-400">You&apos;re not alone</p>
          </div>
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-3">
            <Video className="mx-auto mb-1.5 h-4 w-4 text-sky-400" strokeWidth={2} />
            <p className="text-[11px] leading-tight text-zinc-400">Live mood, daily digest</p>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-3">
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
