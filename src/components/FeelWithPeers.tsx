"use client";

import { useEffect, useState } from "react";
import { HeartHandshake } from "lucide-react";

export interface PromptPeer {
  handle: string;
  author: string;
  preview: string;
  post_id: string;
  feeling: string | null;
}

interface FeelWithPeersProps {
  day: string;
  signedIn: boolean;
  onFeelWith: (handle: string) => void | Promise<void>;
  onDone: () => void;
  onBrowseToday: () => void;
}

export default function FeelWithPeers({
  day,
  signedIn,
  onFeelWith,
  onDone,
  onBrowseToday,
}: FeelWithPeersProps) {
  const [peers, setPeers] = useState<PromptPeer[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [felt, setFelt] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/prompt/peers?day=${encodeURIComponent(day)}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPrompt(typeof data.prompt === "string" ? data.prompt : "");
        setPeers(Array.isArray(data.peers) ? data.peers : []);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [day]);

  return (
    <div className="flex flex-1 flex-col px-5 py-8">
      <div className="mx-auto w-full max-w-md text-center">
        <span className="text-3xl text-[var(--accent)]" aria-hidden>
          ◌
        </span>
        <h3 className="mt-3 font-display text-lg font-bold text-[var(--foreground)]">
          Shared
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {signedIn
            ? "Feel with a few people who answered the same prompt — that’s how the circle grows."
            : "Sign in next time to feel with people answering the same prompt."}
        </p>
        {prompt && (
          <p className="mt-3 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-2 text-left text-xs leading-relaxed text-[var(--muted)]">
            Today: {prompt}
          </p>
        )}
      </div>

      <div className="mx-auto mt-6 w-full max-w-md flex-1 space-y-2">
        {loading && (
          <p className="text-center text-xs text-[var(--muted)]">Finding today’s voices…</p>
        )}
        {!loading && peers.length === 0 && (
          <p className="text-center text-sm text-[var(--muted)]">
            You’re early — be the spark. Browse today’s prompt lane next.
          </p>
        )}
        {peers.map((p) => {
          const done = felt.has(p.handle);
          return (
            <div
              key={p.handle}
              className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-3 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {p.author}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">{p.handle}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--foreground)]">
                    {p.preview}
                  </p>
                </div>
                {signedIn && (
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => {
                      void (async () => {
                        await onFeelWith(p.handle);
                        setFelt((prev) => new Set(prev).add(p.handle));
                      })();
                    }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                      done
                        ? "bg-[var(--accent-soft)] text-[var(--accent-2)]"
                        : "bg-[var(--accent)] text-[var(--surface)] hover:bg-[var(--accent-2)]"
                    }`}
                  >
                    {done ? "Feeling with" : "Feel with"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-2">
        <button
          type="button"
          onClick={onBrowseToday}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-[var(--border-base)] bg-[var(--surface)] py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)]"
        >
          <HeartHandshake className="h-4 w-4 text-[var(--accent)]" />
          See today’s answers
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
