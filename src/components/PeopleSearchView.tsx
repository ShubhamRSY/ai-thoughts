"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, UserPlus, UserCheck, MessageSquare } from "lucide-react";

export type PersonHit = {
  handle: string;
  author: string;
  bio: string;
  avatarUrl: string;
  following: boolean;
  /** A follow request to a private account is waiting on approval. */
  requested?: boolean;
};

export type SearchPostHit = {
  id: string;
  handle: string;
  author: string;
  content: string;
  media_type: string;
  created_at?: string;
  tags?: string[];
};

interface PeopleSearchViewProps {
  signedIn: boolean;
  onNeedSignIn?: () => void;
  onFollow: (handle: string, next: boolean) => void | Promise<void>;
  onOpenPerson?: (handle: string) => void;
  onOpenPost?: (id: string) => void;
  onSearch?: (q: string) => void;
  /** Seed the box with a #tag tapped on a take; the parent clears it on reset. */
  queryOverride?: string | null;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function timeAgo(iso?: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

export default function PeopleSearchView({
  signedIn,
  onNeedSignIn,
  onFollow,
  onOpenPerson,
  onOpenPost,
  onSearch,
  queryOverride,
}: PeopleSearchViewProps) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [posts, setPosts] = useState<SearchPostHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyHandle, setBusyHandle] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
        setPeople([]);
        setPosts([]);
        return;
      }
      setPeople(data.people ?? []);
      setPosts(data.posts ?? []);
    } catch {
      setError("Network error");
      setPeople([]);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (queryOverride !== null && queryOverride !== undefined) {
      setQuery(queryOverride);
      onSearch?.(queryOverride);
    }
  }, [queryOverride, onSearch]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(query.trim()), query.trim() ? 280 : 0);
    return () => window.clearTimeout(t);
  }, [query, load]);

  const toggleFollow = async (person: PersonHit) => {
    if (!signedIn) {
      onNeedSignIn?.();
      return;
    }
    // Tapping "Requested" cancels the request.
    const next = !(person.following || person.requested);
    setBusyHandle(person.handle);
    setPeople((prev) =>
      prev.map((p) =>
        p.handle === person.handle ? { ...p, following: next, requested: false } : p
      )
    );
    try {
      await onFollow(person.handle, next);
      // A private account only gets a request, not a follower: show the server's answer.
      await load(query.trim());
    } catch {
      setPeople((prev) =>
        prev.map((p) =>
          p.handle === person.handle
            ? { ...p, following: person.following, requested: person.requested }
            : p
        )
      );
    } finally {
      setBusyHandle(null);
    }
  };

  return (
    <div className="app-pad space-y-4 py-4">
      <h1 className="text-base font-semibold text-[var(--foreground)]">Search</h1>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          type="search"
          aria-label="Search people, takes, and tags"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, takes, and #tags"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] py-2.5 pl-10 pr-3 text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        />
      </div>

      <p className="text-[13px] text-[var(--foreground)]/70">
        {query.trim() ? "Results across people, takes, and tags" : "Suggested people — follow to see them in your circle"}
      </p>

      {error && <p className="text-[13px] text-rose-700">{error}</p>}

      {loading && people.length === 0 && posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Searching…</p>
      ) : people.length === 0 && posts.length === 0 && query.trim() ? (
        <p className="rounded-xl border border-dashed border-[var(--border-base)] px-3 py-10 text-center text-sm text-[var(--muted)]">
          No results for “{query.trim()}”. Try another name, @handle, or #tag.
        </p>
      ) : (
        <>
          {people.length > 0 ? (
            <ul className="divide-y divide-[var(--border-base)] rounded-xl border border-[var(--border-base)] bg-[var(--surface)]">
              {people.map((p) => (
            <li key={p.handle} className="flex items-center gap-3 px-3 py-2.5">
              <button
                type="button"
                onClick={() => onOpenPerson?.(p.handle)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[11px] font-semibold">
                    {initials(p.author)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[var(--foreground)]">
                    {p.author}
                  </p>
                  <p className="truncate text-[13px] text-[var(--foreground)]/70">{p.handle}</p>
                  {p.bio ? (
                    <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--muted)]">{p.bio}</p>
                  ) : null}
                </div>
              </button>
              <button
                type="button"
                disabled={busyHandle === p.handle}
                onClick={() => void toggleFollow(p)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50 ${
                  p.following || p.requested
                    ? "border border-[var(--border-base)] text-[var(--foreground)]"
                    : "bg-[var(--accent)] text-[var(--surface)]"
                }`}
              >
                {p.following ? (
                  <>
                    <UserCheck className="h-3.5 w-3.5" />
                    Following
                  </>
                ) : p.requested ? (
                  <>
                    <UserCheck className="h-3.5 w-3.5" />
                    Requested
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    Follow
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {posts.length > 0 ? (
        <>
          <p className="text-[13px] font-medium text-[var(--foreground)]/60">Takes</p>
          <ul className="divide-y divide-[var(--border-base)] rounded-xl border border-[var(--border-base)] bg-[var(--surface)]">
            {posts.map((post) => {
              const tags = (post.tags ?? []).filter(Boolean);
              return (
                <li key={post.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPost?.(post.id)}
                    className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-[var(--foreground)]/70">
                        {post.author}{" "}
                        <span className="text-[var(--muted)]">{post.handle}</span>
                        {post.created_at ? (
                          <span className="ml-1 text-[var(--muted)]">
                            · {timeAgo(post.created_at)}
                          </span>
                        ) : null}
                      </p>
                      <p className="line-clamp-2 text-[14px] text-[var(--foreground)]">
                        {post.content}
                      </p>
                      {tags.length > 0 ? (
                        <p className="mt-0.5 truncate text-[12px] text-[var(--accent)]">
                          {tags.map((t) => `#${t}`).join(" ")}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </>
    )}
    </div>
  );
}
