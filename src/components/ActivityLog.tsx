"use client";

import { useEffect, useRef, useState } from "react";

type Item = {
  id: string;
  type: string;
  at: string;
  post_id?: string;
  preview?: string;
  handle?: string;
  archived?: boolean;
};

const GROUPS = [
  { id: "all", label: "All" },
  { id: "posts", label: "Takes" },
  { id: "replies", label: "Replies" },
  { id: "reactions", label: "Reactions" },
  { id: "follows", label: "Follows" },
];

const VERB: Record<string, string> = {
  post: "You shared a take",
  reply: "You replied",
  like: "You liked a take",
  repost: "You reposted a take",
  save: "You saved a take",
  reaction: "You reacted to a take",
  follow: "You followed",
  follow_request: "You asked to follow",
};

/** Your own history: takes, replies, reactions and follows. Private to you. */
export default function ActivityLog() {
  const [group, setGroup] = useState("all");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setItems(null);
    setError(false);
    fetch(`/api/account/activity?type=${group}`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (mine === seq.current) setItems(d.items ?? []);
      })
      .catch(() => {
        if (mine === seq.current) setError(true);
      });
  }, [group]);

  return (
    <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Activity filter">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              group === g.id
                ? "bg-[var(--accent)] text-[var(--surface)]"
                : "border border-[var(--border-base)] text-[var(--foreground)]"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-3 text-xs font-medium text-rose-700">Couldn’t load your activity.</p>
      ) : items === null ? (
        <p className="mt-3 text-xs text-[var(--muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--muted)]">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border-base)]">
          {items.map((i) => (
            <li key={i.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {VERB[i.type] ?? "Activity"}
                  {i.handle ? ` ${i.handle}` : ""}
                  {i.archived ? " (archived)" : ""}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                  {new Date(i.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
              {i.preview ? (
                <p dir="auto" className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
                  {i.preview}
                </p>
              ) : i.post_id ? (
                <p className="mt-0.5 text-xs italic text-[var(--muted)]">
                  This take isn’t available to you anymore.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
