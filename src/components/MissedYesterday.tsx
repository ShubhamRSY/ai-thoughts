"use client";

import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { yesterdayKey } from "@/lib/daily-prompt";

interface CatchupPost {
  id: string;
  handle: string;
  author: string;
  content: string;
  feeling: string | null;
}

interface MissedYesterdayProps {
  signedIn: boolean;
  hasCircle: boolean;
  checkedInToday: boolean;
  onOpenCircle: () => void;
  onAnswerToday: () => void;
}

const DISMISS_PREFIX = "aithoughts.catchup.dismissed.";

export default function MissedYesterday({
  signedIn,
  hasCircle,
  checkedInToday,
  onOpenCircle,
  onAnswerToday,
}: MissedYesterdayProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [day, setDay] = useState(yesterdayKey());
  const [posts, setPosts] = useState<CatchupPost[]>([]);

  useEffect(() => {
    if (!signedIn || !hasCircle) return;
    const yKey = yesterdayKey();
    try {
      if (localStorage.getItem(DISMISS_PREFIX + yKey) === "1") return;
    } catch {
      /* ignore */
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/prompt/peers?mode=catchup&day=${encodeURIComponent(yKey)}`,
          { credentials: "include", cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data.posts) ? data.posts : [];
        if (list.length === 0) return;
        setDay(typeof data.day === "string" ? data.day : yKey);
        setPrompt(typeof data.prompt === "string" ? data.prompt : "");
        setPosts(list);
        setOpen(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, hasCircle]);

  if (!open || posts.length === 0) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_PREFIX + day, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <section className="app-pad mt-3">
      <div className="overflow-hidden rounded-2xl border border-[var(--border-base)] bg-[var(--surface)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-base)] bg-[var(--surface-2)]/50 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <History className="h-3.5 w-3.5 text-[var(--accent)]" />
              Missed yesterday?
            </p>
            <p className="mt-1 text-sm font-medium leading-snug text-[var(--foreground)]">
              Here’s what people you feel with said
            </p>
            {prompt && (
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Prompt: {prompt}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="divide-y divide-[var(--border-base)]">
          {posts.slice(0, 4).map((p) => (
            <li key={p.id} className="px-4 py-3">
              <p className="text-xs font-semibold text-[var(--foreground)]">
                {p.author}{" "}
                <span className="font-normal text-[var(--muted)]">{p.handle}</span>
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-[var(--foreground)]">
                {p.content}
              </p>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 border-t border-[var(--border-base)] px-4 py-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              dismiss();
              onOpenCircle();
            }}
            className="flex-1 rounded-full border border-[var(--border-base)] py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)]"
          >
            Open Feel with
          </button>
          {!checkedInToday && (
            <button
              type="button"
              onClick={() => {
                dismiss();
                onAnswerToday();
              }}
              className="flex-1 rounded-full bg-[var(--accent)] py-2 text-xs font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
            >
              Share your feeling
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
