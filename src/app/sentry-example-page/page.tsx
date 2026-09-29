"use client";

// TEMPORARY — buttons to confirm Sentry receives server and browser errors.
// Delete with src/app/api/sentry-example-api once verified.
import { useState } from "react";

export default function SentryExamplePage() {
  const [status, setStatus] = useState("");

  async function serverError() {
    setStatus("Calling the server…");
    const res = await fetch("/api/sentry-example-api");
    setStatus(
      res.status === 500
        ? "Server returned 500 — look for “Sentry example: server error” in Sentry."
        : `Server returned ${res.status} (expected 500).`
    );
  }

  function browserError() {
    setStatus("Thrown — look for “Sentry example: browser error” in Sentry.");
    // Thrown after this handler returns, so it's uncaught and reaches
    // Sentry's global error handler instead of crashing the page.
    setTimeout(() => {
      throw new Error("Sentry example: browser error");
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Sentry test</h1>
      <button
        type="button"
        onClick={serverError}
        className="rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--surface)]"
      >
        Throw a server error
      </button>
      <button
        type="button"
        onClick={browserError}
        className="rounded-full border border-[var(--border-base)] px-4 py-3 text-sm font-semibold"
      >
        Throw a browser error
      </button>
      <p role="status" className="min-h-6 text-sm text-[var(--muted)]">
        {status}
      </p>
    </main>
  );
}
