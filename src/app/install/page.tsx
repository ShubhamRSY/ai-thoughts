"use client";

import { useState } from "react";
import Link from "next/link";
import { Smartphone, ShieldCheck, Download, CheckCircle2, Monitor } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { useAuth } from "@/hooks/useAuth";
import { BRAND } from "@/lib/brand";

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
  const { user, loading } = useAuth();
  const [ios] = useState(() => isIOS());
  const [installed] = useState(() => isInstalled());

  return (
    <div className="app-rail flex min-h-dvh flex-col pb-16 pt-10">
      <Link
        href={user ? "/app" : "/"}
        className="mb-6 flex w-fit items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
      >
        ← Back
      </Link>

      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--accent)] text-4xl">
          <BrandMark className="h-11 w-11" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">
            Get {BRAND.shortName}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Real apps for iPhone and Windows — same Voices experience.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <Smartphone className="h-4 w-4 text-[var(--accent)]" /> iPhone / iPad
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Native AiTo app (Capacitor). Built in Xcode → TestFlight or App Store. Sign in once
            inside the app and you stay logged in.
          </p>
          <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
            Store link coming after Apple review. Until then: use{" "}
            <strong className="text-[var(--foreground)]">Add to Home Screen</strong> below, or ask
            for a TestFlight invite.
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <Monitor className="h-4 w-4 text-[var(--accent)]" /> Windows PC
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Downloadable{" "}
            <span className="text-[var(--foreground)]">AiTo Setup.exe</span> desktop app. Installs
            like a normal Windows program with a Start Menu shortcut.
          </p>
          <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
            Build with <code className="text-[var(--foreground)]">npm run desktop:win</code> (see{" "}
            <span className="text-[var(--foreground)]">NATIVE.md</span>). Public download link goes
            live once the first .exe is uploaded.
          </p>
        </section>
      </div>

      {installed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          <h2 className="text-base font-bold text-[var(--foreground)]">It&apos;s on your home screen</h2>
          <p className="max-w-xs text-sm text-[var(--muted)]">
            {user
              ? "You’re signed in. Open Voices anytime."
              : "Open the app icon — sign in once and you’ll stay logged in."}
          </p>
          <Link
            href={user ? "/app" : "/sign-in?next=/app"}
            className="mt-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-95"
          >
            {user ? "Open Voices" : "Sign in"}
          </Link>
        </div>
      ) : loading ? (
        <p className="text-center text-sm text-[var(--muted)]">Checking your session…</p>
      ) : !user ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--border-base)] bg-white px-6 py-10 text-center shadow-sm">
          <Download className="h-9 w-9 text-[var(--accent)]" />
          <h2 className="text-base font-bold text-[var(--foreground)]">Sign in for quick install</h2>
          <p className="max-w-xs text-sm leading-relaxed text-[var(--muted)]">
            For the free home-screen install, sign in first so the icon opens already logged in.
          </p>
          <Link
            href="/sign-in?next=/install"
            className="mt-1 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-95"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Download className="h-4 w-4 text-[var(--accent)]" /> Quick: add to home screen
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              You&apos;re signed in as {user.displayName}. Works today — no App Store wait.
            </p>

            <ol className="mt-4 flex flex-col gap-3">
              {ios ? (
                <>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      1
                    </span>
                    Stay in{" "}
                    <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Safari</span>{" "}
                    while signed in
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      2
                    </span>
                    Tap <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Share</span>
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      3
                    </span>
                    Tap{" "}
                    <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">
                      Add to Home Screen
                    </span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      1
                    </span>
                    Stay signed in in Chrome
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      2
                    </span>
                    Menu →{" "}
                    <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium text-[var(--accent)]">
                      Install app
                    </span>
                  </li>
                </>
              )}
            </ol>
          </section>

          <Link
            href="/app"
            className="flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-95"
          >
            Open Voices
          </Link>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> Why this is safe
        </h2>
        <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-[var(--muted)]">
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            Same HTTPS site as the web — no random third-party store clone.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            Sign in once; your session stays so the app opens logged in.
          </li>
        </ul>
      </section>
    </div>
  );
}
