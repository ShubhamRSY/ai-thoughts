"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
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
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = searchParams.get("from") ?? "/app";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }

    setSubmitting(true);
    const result = await signIn(email.trim(), displayName.trim());
    setSubmitting(false);

    if (result.ok) {
      router.push(from);
      router.refresh();
    } else {
      setError(result.error ?? "Sign in failed");
    }
  };

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center overflow-hidden bg-zinc-950 px-6 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
        aria-hidden
      />
      <div className="animate-aurora pointer-events-none absolute inset-x-0 top-0 h-80 opacity-40">
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-violet-600/40 to-transparent blur-3xl" />
      </div>
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[100px]" aria-hidden />

      <div className="relative z-10 w-full">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-xl shadow-violet-500/30">
            <BrandMark className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Join the pulse</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total < 25
              ? "Be one of the first to share how AI makes you feel"
              : `${total.toLocaleString()} voices already sharing how AI makes them feel`}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-zinc-800/60 bg-zinc-900/60 p-6 backdrop-blur-xl"
        >
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-zinc-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              required
            />
          </div>

          <div>
            <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-zinc-400">
              Display name <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alex"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="animate-shimmer relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:hover:brightness-100"
          >
            {submitting ? "Signing in…" : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </>
            )}
          </button>

          <p className="text-center text-[11px] text-zinc-600">
            New here or returning — one email gets you in. No password.
          </p>
        </form>

        <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-zinc-600">
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
          <Link href="/" className="text-xs text-zinc-500 transition hover:text-zinc-300">
            ← Back to intro
          </Link>
        </div>
      </div>
    </div>
  );
}
