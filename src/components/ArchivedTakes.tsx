"use client";

import { useEffect, useRef, useState } from "react";

type Take = { id: string; content: string; created_at: string };

/** Takes you've hidden from everyone; only you can see them, and you can bring them back. */
export default function ArchivedTakes() {
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = async () => {
    const mine = ++seq.current;
    try {
      const res = await fetch("/api/posts?archived=1", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (mine === seq.current) setTakes(data);
    } catch {
      if (mine === seq.current) setError("Couldn’t load your archive.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const unarchive = async (id: string) => {
    seq.current++;
    setTakes((t) => t && t.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/posts/${id}/archive`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("Couldn’t restore that take.");
      await load();
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
      {takes === null ? (
        <p className="text-xs text-[var(--muted)]">{error ?? "Loading…"}</p>
      ) : takes.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          Nothing archived. Archive a take from your profile to hide it without deleting it.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-base)]">
          {takes.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <p dir="auto" className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
                {t.content}
              </p>
              <button
                type="button"
                aria-label={`Restore take: ${t.content.slice(0, 40)}`}
                onClick={() => void unarchive(t.id)}
                className="shrink-0 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--accent)]"
              >
                Unarchive
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && takes !== null && <p className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
    </div>
  );
}
