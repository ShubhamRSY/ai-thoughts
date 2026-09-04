"use client";

import { useState } from "react";
import Link from "next/link";
import { Smartphone, ShieldCheck, Download, CheckCircle2 } from "lucide-react";
import BrandMark from "@/components/BrandMark";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" &&
      typeof navigator.maxTouchPoints === "number" &&
      navigator.maxTouchPoints > 1)
  );
}

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function InstallPage() {
  const [ios] = useState(() => isIOS());
  const [installed] = useState(() => isInstalled());

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-16 pt-10">
      <Link
        href="/"
        className="mb-6 flex w-fit items-center gap-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"
      >
        ← Back to the pulse
      </Link>

      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-500 text-4xl shadow-lg shadow-violet-500/30">
          <BrandMark className="h-11 w-11" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">AI·Thoughts</h1>
          <p className="mt-1 text-sm text-zinc-400">
            The Public Pulse — how people really feel about AI
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" /> Safe · Verified web app — nothing to download to your device
        </span>
      </div>

      {installed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-10 text-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-400" />
          <h2 className="text-base font-bold text-zinc-100">It&apos;s installed</h2>
          <p className="max-w-xs text-sm text-zinc-400">
            This app is running from your home screen. That&apos;s it — no files, no installers to manage.
          </p>
          <Link
            href="/"
            className="mt-2 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
          >
            Open the pulse
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Download className="h-4 w-4 text-violet-400" /> Add it to your home screen
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              My phone or tablet gives this app its own icon — not an installer file. It runs
              safely every time and never touches anything else on your device.
            </p>

            <ol className="mt-4 flex flex-col gap-3">
              {ios ? (
                <>
                  <li className="flex items-start gap-3 text-xs text-zinc-300">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">1</span>
                    Open <span className="rounded bg-zinc-800 px-1.5 font-medium text-zinc-200">Safari</span> on your iPhone/iPad
                  </li>
                  <li className="flex items-start gap-3 text-xs text-zinc-300">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">2</span>
                    Tap the Share button <span className="rounded bg-zinc-800 px-1.5 font-medium text-zinc-200">Share</span> at the bottom
                  </li>
                  <li className="flex items-start gap-3 text-xs text-zinc-300">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">3</span>
                    Tap <span className="rounded bg-zinc-800 px-1.5 font-medium text-zinc-200">Add to Home Screen</span>, then <span className="rounded bg-zinc-800 px-1.5 font-medium text-zinc-200">Add</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-3 text-xs text-zinc-300">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">1</span>
                    Open this page in <span className="rounded bg-zinc-800 px-1.5 font-medium text-zinc-200">Chrome</span> or your browser
                  </li>
                  <li className="flex items-start gap-3 text-xs text-zinc-300">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">2</span>
                    Use the browser menu (<span className="rounded bg-zinc-800 px-1.5 font-medium">⋮</span> or <span className="rounded bg-zinc-800 px-1.5 font-medium">Install</span>)
                  </li>
                  <li className="flex items-start gap-3 text-xs text-zinc-300">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">3</span>
                    Tap <span className="rounded bg-zinc-800 px-1.5 font-medium text-violet-300">Install app</span>
                  </li>
                </>
              )}
            </ol>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Smartphone className="h-4 w-4 text-violet-400" /> Or just use it in the browser
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              No install needed — the full app works right here in any modern browser.
            </p>
            <Link
              href="/"
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:from-violet-400 hover:to-indigo-400 active:scale-95"
            >
              Start using it now
            </Link>
          </section>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <ShieldCheck className="h-4 w-4 text-emerald-400" /> Why this is safe
        </h2>
        <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-zinc-400">
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            It&apos;s a <span className="text-zinc-200">web app</span> — there is no executable file to download, so there&apos;s nothing that can carry a virus.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            It uses <span className="text-zinc-200">HTTPS</span> on every request, so your data stays private in transit.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            No third-party trackers or scripts are loaded on this page.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            If you change your mind, deleting the icon removes the app completely.
          </li>
        </ul>
      </section>
    </div>
  );
}
