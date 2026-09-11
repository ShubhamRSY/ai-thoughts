"use client";

import { useState } from "react";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export default function ContactPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("privacy");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message, kind }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not send message");
      } else {
        setDone(data.message ?? "Message received");
        setMessage("");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-rail min-h-dvh py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">Contact</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Privacy requests, data removal, or questions for community keepers.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5"
      >
        <div>
          <label htmlFor="kind" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
            Topic
          </label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          >
            <option value="privacy">Privacy / data</option>
            <option value="removal">Remove my takes or account</option>
            <option value="general">General</option>
          </select>
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
            Your email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="message" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
            Message
          </label>
          <textarea
            id="message"
            required
            rows={5}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full resize-none rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            placeholder="Tell us what you need…"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}
        {done && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700">
            {done}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send message"}
        </button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
        Prefer email? Write{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-[var(--accent)] underline-offset-2 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <div className="mt-8">
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
