"use client";

import { useState } from "react";
import Link from "next/link";
import { Smartphone, ShieldCheck, Download, CheckCircle2 } from "lucide-react";
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
            {BRAND.shortName}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{BRAND.tagline}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" /> Safe web app — install while signed in to stay logged in
        </span>
      </div>

      {installed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          <h2 className="text-base font-bold text-[var(--foreground)]">It&apos;s installed</h2>
          <p className="max-w-xs text-sm text-[var(--muted)]">
            {user
              ? "You’re signed in. Open Voices from your home screen anytime."
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
          <h2 className="text-base font-bold text-[var(--foreground)]">Sign in first</h2>
          <p className="max-w-xs text-sm leading-relaxed text-[var(--muted)]">
            Install after you&apos;re signed in so the home-screen app opens already logged in —
            no extra email code.
          </p>
          <Link
            href="/sign-in?next=/install"
            className="mt-1 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-95"
          >
            Sign in to install
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Download className="h-4 w-4 text-[var(--accent)]" /> Add to home screen
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              You&apos;re signed in as {user.displayName}. Install now and the app icon opens
              straight into Voices — still logged in.
            </p>

            <ol className="mt-4 flex flex-col gap-3">
              {ios ? (
                <>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      1
                    </span>
                    Stay in <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Safari</span> while signed in
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
                    , then <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Add</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      1
                    </span>
                    Stay signed in in <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Chrome</span>
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      2
                    </span>
                    Open the menu (<span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">⋮</span> or Install)
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      3
                    </span>
                    Tap{" "}
                    <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium text-[var(--accent)]">
                      Install app
                    </span>
                  </li>
                </>
              )}
            </ol>
          </section>

          <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Smartphone className="h-4 w-4 text-[var(--accent)]" /> Or keep using the browser
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              No install needed — you&apos;re already signed in here.
            </p>
            <Link
              href="/app"
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-95"
            >
              Open Voices
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
            It&apos;s a <span className="text-[var(--foreground)]">web app</span> — no installer file,
            nothing that can carry a virus.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            Your sign-in cookie stays on this site so the installed app opens logged in.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            HTTPS on every request. Delete the icon anytime to remove the app.
          </li>
        </ul>
      </section>
    </div>
  );
}
