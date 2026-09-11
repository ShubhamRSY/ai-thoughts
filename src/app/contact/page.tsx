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
    <div className="mx-auto min-h-dvh w-full max-w-[430px] px-5 py-8">
      <h1 className="text-2xl font-bold text-zinc-100">Contact</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Privacy requests, data removal, or questions for community keepers.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5"
      >
        <div>
          <label htmlFor="kind" className="mb-1.5 block text-xs font-medium text-zinc-400">
            Topic
          </label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
          >
            <option value="privacy">Privacy / data</option>
            <option value="removal">Remove my takes or account</option>
            <option value="general">General</option>
          </select>
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-zinc-400">
            Your email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="message" className="mb-1.5 block text-xs font-medium text-zinc-400">
            Message
          </label>
          <textarea
            id="message"
            required
            rows={5}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            placeholder="Tell us what you need…"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
            {error}
          </div>
        )}
        {done && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-400">
            {done}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send message"}
        </button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        Prefer email? Write{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-violet-400 underline-offset-2 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <div className="mt-8">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
