"use client";

import { useState } from "react";
import Link from "next/link";
import { Share, Smartphone, ShieldCheck, CheckCircle2, MoreVertical, Apple, Laptop } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import WindowsStoreCta from "@/components/WindowsStoreCta";
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
            Install {BRAND.shortName}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Put Voices on your home screen — free, one minute.
          </p>
        </div>
      </div>

      {installed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          <h2 className="text-base font-bold text-[var(--foreground)]">Already installed</h2>
          <p className="max-w-xs text-sm text-[var(--muted)]">
            {user
              ? "You’re signed in. Open Voices from your home screen anytime."
              : "Open the AiTo icon — sign in once and you’ll stay logged in."}
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
      ) : (
        <div className="flex flex-col gap-3">
          {!user && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">1. Sign in first</h2>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                Sign in on your phone, then add to home screen — the app opens already logged in.
              </p>
              <Link
                href="/sign-in?next=/install"
                className="mt-4 flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-95"
              >
                Sign in with email
              </Link>
            </section>
          )}

          {BRAND.windowsStoreUrl && (
            <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                <Laptop className="h-4 w-4 text-[var(--accent)]" /> Windows
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                Get AiTo from the <span className="text-[var(--foreground)]">Microsoft Store</span> —
                install like any Windows app, updates through the Store.
              </p>
              <div className="mt-4">
                <WindowsStoreCta buttonClassName="flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70" />
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Apple className="h-4 w-4 text-[var(--accent)]" /> Mac
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              Two ways to get AiTo on your Mac:
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
                <p className="text-xs font-semibold text-[var(--foreground)]">
                  Safari — Add to Dock
                </p>
                <ol className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-[var(--muted)]">
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-semibold text-teal-800">
                      1
                    </span>
                    <span className="min-w-0">
                    Open <span className="text-[var(--foreground)]">aito.social</span> in Safari
                    (macOS 14+)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-semibold text-teal-800">
                      2
                    </span>
                    <span className="min-w-0">
                    Menu bar → <span className="text-[var(--foreground)]">File → Add to Dock</span></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-semibold text-teal-800">
                      3
                    </span>
                    <span className="min-w-0">
                    AiTo opens like an app from your Dock</span>
                  </li>
                </ol>
              </div>
              <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
                <p className="text-xs font-semibold text-[var(--foreground)]">
                  Chrome / Edge — Install app
                </p>
                <ol className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-[var(--muted)]">
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-semibold text-teal-800">
                      1
                    </span>
                    <span className="min-w-0">
                    Open <span className="text-[var(--foreground)]">aito.social</span> in Chrome or
                    Edge</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-semibold text-teal-800">
                      2
                    </span>
                    <span className="min-w-0">
                    Menu →{" "}
                    <span className="text-[var(--foreground)]">Install AiTo…</span></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-semibold text-teal-800">
                      3
                    </span>
                    <span className="min-w-0">
                    Runs in its own window with a Dock icon</span>
                  </li>
                </ol>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Smartphone className="h-4 w-4 text-[var(--accent)]" />
              Add to home screen
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              {user
                ? `Signed in as ${user.displayName}. Do this next on this phone:`
                : "After you sign in, stay on this phone and follow the steps for your device."}
            </p>

            <ol className="mt-4 flex flex-col gap-3">
              {ios ? (
                <>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      1
                    </span>
                    <span className="min-w-0">
                    Open this site in{" "}
                    <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Safari</span>{" "}
                    (not Chrome)</span>
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      2
                    </span>
                    <span className="min-w-0">
                    Tap{" "}
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-2)] px-1.5 font-medium">
                      <Share className="h-3 w-3" /> Share
                    </span>{" "}
                    at the bottom</span>
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      3
                    </span>
                    <span className="min-w-0">
                    Scroll and tap{" "}
                    <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">
                      Add to Home Screen
                    </span>
                    , then <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Add</span></span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      1
                    </span>
                    <span className="min-w-0">
                    Open{" "}
                    <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">
                      aito.social
                    </span>{" "}
                    in Chrome</span>
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      2
                    </span>
                    <span className="min-w-0">
                    Tap{" "}
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-2)] px-1.5 font-medium">
                      <MoreVertical className="h-3 w-3" /> Menu
                    </span></span>
                  </li>
                  <li className="flex items-start gap-3 text-xs text-[var(--foreground)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                      3
                    </span>
                    <span className="min-w-0">
                    Tap{" "}
                    <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium text-[var(--accent)]">
                      Install app
                    </span>{" "}
                    or <span className="rounded bg-[var(--surface-2)] px-1.5 font-medium">Add to Home screen</span></span>
                  </li>
                </>
              )}
            </ol>
          </section>

          {user && (
            <Link
              href="/app"
              className="flex w-full items-center justify-center rounded-xl border border-[var(--border-base)] bg-white px-5 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
            >
              Open Voices in browser
            </Link>
          )}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> Safe & free
        </h2>
        <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-[var(--muted)]">
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span className="min-w-0">
            Phone: home-screen web app for{" "}
            <span className="text-[var(--foreground)]">aito.social</span> — no App Store fee</span>
          </li>
          {BRAND.windowsStoreUrl && (
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span className="min-w-0">
              Windows: Microsoft Store (updates via the Store)</span>
            </li>
          )}
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span className="min-w-0">
            Sign in once — the app opens logged in</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
