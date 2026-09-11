"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import BrandMark from "@/components/BrandMark";

export default function SignInForm({ total }: { total: number }) {
  return (
    <Suspense fallback={null}>
      <SignInFormInner total={total} />
    </Suspense>
  );
}

function SignInFormInner({ total }: { total: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { requestCode, verifyCode } = useAuth();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = searchParams.get("from") ?? "/app";

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    setSubmitting(true);
    const result = await requestCode(email.trim(), displayName.trim());
    setSubmitting(false);
    if (result.ok) {
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
      router.push(from);
      router.refresh();
    } else {
      setError(result.error ?? "Verification failed");
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]">
        <BrandMark className="h-8 w-8" />
      </div>
      <h1 className="font-display mt-8 text-3xl font-medium tracking-tight text-[var(--foreground)]">
        {step === "email" ? "Join the pulse" : "Check your email"}
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {step === "email"
          ? total < 25
            ? "Be one of the first voices."
            : `${total.toLocaleString()} voices already here.`
          : `Code sent to ${email}`}
      </p>

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
          {error && <p className="text-xs text-rose-700">{error}</p>}
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
              Dev code: <span className="font-mono font-semibold text-[var(--foreground)]">{devCode}</span>
            </p>
          )}
          {error && <p className="text-xs text-rose-700">{error}</p>}
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
            className="w-full text-center text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Use a different email
          </button>
        </form>
      )}

      <Link href="/" className="mt-8 text-center text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
        ← Back
      </Link>
    </div>
  );
}
