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
        className="mb-6 flex w-fit items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
      >
        ← Back to the pulse
      </Link>

      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--accent)] text-4xl">
          <BrandMark className="h-11 w-11" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">AI·Thoughts</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            The Public Pulse — how people really feel about AI
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" /> Safe · Verified web app — nothing to download to your device
        </span>
      </div>

      {installed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          <h2 className="text-base font-bold text-[var(--foreground)]">It&apos;s installed</h2>
          <p className="max-w-xs text-sm text-[var(--muted)]">
            This app is running from your home screen. That&apos;s it — no files, no installers to manage.
          </p>
          <Link
            href="/"
            className="mt-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-95"
          >
            Open the pulse
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Download className="h-4 w-4 text-[var(--accent)]" /> Add it to your home screen
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              My phone or tablet gives this app its own icon — not an installer file. It runs
              safely every time and never touches anything else on your device.
            </p>

            <ol className="mt-4 flex flex-col gap-3">
              {ios ? (
                <>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">1</span>
                    Open <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Safari</span> on your iPhone/iPad
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">2</span>
                    Tap the Share button <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Share</span> at the bottom
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">3</span>
                    Tap <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Add to Home Screen</span>, then <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Add</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">1</span>
                    Open this page in <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Chrome</span> or your browser
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">2</span>
                    Use the browser menu (<span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">⋮</span> or <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Install</span>)
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">3</span>
                    Tap <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium text-[var(--accent)]">Install app</span>
                  </li>
                </>
              )}
            </ol>
          </section>

          <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Smartphone className="h-4 w-4 text-[var(--accent)]" /> Or just use it in the browser
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              No install needed — the full app works right here in any modern browser.
            </p>
            <Link
              href="/"
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-95"
            >
              Start using it now
            </Link>
          </section>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> Why this is safe
        </h2>
        <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-[var(--muted)]">
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            It&apos;s a <span className="text-[var(--foreground)]">web app</span> — there is no executable file to download, so there&apos;s nothing that can carry a virus.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            It uses <span className="text-[var(--foreground)]">HTTPS</span> on every request, so your data stays private in transit.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            No third-party trackers or scripts are loaded on this page.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            If you change your mind, deleting the icon removes the app completely.
          </li>
        </ul>
      </section>
    </div>
  );
}
