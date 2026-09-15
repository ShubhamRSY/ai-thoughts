"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import BrandMark from "@/components/BrandMark";
import { BRAND } from "@/lib/brand";

function OpeningPulse({ name }: { name?: string }) {
  return (
    <div className="app-frame">
      <div className="app-pad relative flex min-h-dvh flex-col items-center justify-center overflow-hidden text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--accent-soft)_0%,transparent_65%)] opacity-70"
        />
        <div className="relative flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)] shadow-sm">
            <BrandMark className="h-9 w-9" />
          </div>
          <h1 className="font-display mt-6 text-2xl font-medium tracking-tight text-[var(--foreground)]">
            {name ? `Welcome back, ${name}` : "Welcome back"}
          </h1>
          <p className="mt-2 max-w-[24ch] text-sm text-[var(--muted)]">
            Taking you into Voices…
          </p>
          <div className="mt-8 flex items-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:300ms]" />
          </div>
          <Link
            href="/app"
            className="mt-10 text-xs font-medium text-[var(--muted)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
          >
            Continue now
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignInForm({ total }: { total: number }) {
  return (
    <Suspense fallback={<OpeningPulse />}>
      <SignInFormInner total={total} />
    </Suspense>
  );
}

function SignInFormInner({}: { total: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { requestCode, verifyCode, user, loading } = useAuth();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = searchParams.get("next") ?? searchParams.get("from") ?? "/app";
  const dest = from.startsWith("/") && !from.startsWith("//") ? from : "/app";

  useEffect(() => {
    if (!loading && user) {
      router.replace(dest);
    }
  }, [loading, user, dest, router]);

  if (loading || user) {
    return <OpeningPulse name={user?.displayName} />;
  }

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (user) {
      router.replace(dest);
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    setSubmitting(true);
    const result = await requestCode(email.trim(), displayName.trim());
    setSubmitting(false);
    if (result.ok) {
      if (result.alreadySignedIn) {
        router.replace(dest);
        return;
      }
      setDevCode(result.devCode ?? null);
      setStep("code");
      setCode("");
    } else {
      setError(result.error ?? "Could not send code");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setSubmitting(true);
    const result = await verifyCode(email.trim(), code.trim());
    setSubmitting(false);
    if (result.ok) {
      router.replace(dest);
      router.refresh();
    } else {
      setError(result.error ?? "Verification failed");
    }
  };

  return (
    <div className="app-frame">
      <div className="app-pad flex min-h-dvh w-full flex-col justify-center py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]">
          <BrandMark className="h-8 w-8" />
        </div>
        <h1 className="font-display mt-8 text-3xl font-medium tracking-tight text-[var(--foreground)]">
          {step === "email" ? "Join Voices" : "Check your email"}
        </h1>
        <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-[var(--muted)]">
          {step === "email"
            ? BRAND.tagline
            : `Code sent to ${email}`}
        </p>
        {step === "email" && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Pick a feeling. Say it in voice, video, or words. Feel with others.
          </p>
        )}

        {step === "email" ? (
          <form onSubmit={handleRequestCode} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                Display name <span className="opacity-60">(optional)</span>
              </span>
              <input
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="Alex"
              />
            </label>
            {error && <p className="text-xs leading-relaxed text-rose-700">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)] disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send sign-in code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">6-digit code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3 text-center text-lg tracking-[0.35em] outline-none focus:border-[var(--accent)]"
                placeholder="000000"
                autoFocus
                required
              />
            </label>
            {devCode && (
              <p className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
                Dev code:{" "}
                <span className="font-mono font-semibold text-[var(--foreground)]">{devCode}</span>
              </p>
            )}
            {error && <p className="text-xs leading-relaxed text-rose-700">{error}</p>}
            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full rounded-full bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)] disabled:opacity-50"
            >
              {submitting ? "Verifying…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
                setDevCode(null);
              }}
              className="w-full text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              ← Use a different email
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-[11px] text-[var(--muted)]">
          <Link href="/" className="hover:text-[var(--foreground)]">
            ← Back
          </Link>
        </p>
      </div>
    </div>
  );
}
