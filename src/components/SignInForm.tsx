"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Lock, ShieldCheck } from "lucide-react";
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
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center overflow-hidden px-6 py-10">
      <div className="relative z-10 w-full">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]">
            <BrandMark className="h-10 w-10" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--foreground)]">
            {step === "email" ? "Join the pulse" : "Check your email"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {step === "email"
              ? total < 25
                ? "Be one of the first to share how AI makes you feel"
                : `${total.toLocaleString()} voices already sharing how AI makes them feel`
              : `We sent a 6-digit code to ${email}`}
          </p>
        </div>

        {step === "email" ? (
          <form
            onSubmit={handleRequestCode}
            className="space-y-4 rounded-3xl border border-[var(--border-base)] bg-white p-6 shadow-sm shadow-slate-900/5"
          >
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                required
              />
            </div>

            <div>
              <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                Display name <span className="text-[var(--muted)]/70">(optional)</span>
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex"
                className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? "Sending code…" : (
                <>
                  Send sign-in code
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-[var(--muted)]">
              We email a one-time code — no password to remember.
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleVerify}
            className="space-y-4 rounded-3xl border border-[var(--border-base)] bg-white p-6 shadow-sm shadow-slate-900/5"
          >
            <div>
              <label htmlFor="code" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                6-digit code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-4 py-2.5 text-center text-lg tracking-[0.35em] text-[var(--foreground)] placeholder:text-[var(--muted)]/60 outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                required
                autoFocus
              />
            </div>

            {devCode && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                Dev mode (no Resend key): use code <span className="font-mono font-semibold">{devCode}</span>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? "Verifying…" : (
                <>
                  Verify &amp; continue
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
                setDevCode(null);
              }}
              className="flex w-full items-center justify-center gap-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              <ArrowLeft className="h-3 w-3" />
              Use a different email
            </button>
          </form>
        )}

        <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3 w-3" strokeWidth={2} />
            Email never shared
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" strokeWidth={2} />
            HTTPS &amp; encrypted cookies
          </span>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]">
            ← Back to intro
          </Link>
        </div>
      </div>
    </div>
  );
}
