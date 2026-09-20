"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, UserPlus, UserCheck } from "lucide-react";

export type PersonHit = {
  handle: string;
  author: string;
  bio: string;
  avatarUrl: string;
  following: boolean;
  /** A follow request to a private account is waiting on approval. */
  requested?: boolean;
};

interface PeopleSearchViewProps {
  signedIn: boolean;
  onNeedSignIn?: () => void;
  onFollow: (handle: string, next: boolean) => void | Promise<void>;
  onOpenPerson?: (handle: string) => void;
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

export default function PeopleSearchView({
  signedIn,
  onNeedSignIn,
  onFollow,
  onOpenPerson,
}: PeopleSearchViewProps) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyHandle, setBusyHandle] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/people?q=${encodeURIComponent(q)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
        setPeople([]);
        return;
      }
      setPeople(data.people ?? []);
    } catch {
      setError("Network error");
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] py-2.5 pl-10 pr-3 text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        />
      </div>

      <p className="text-[13px] text-[var(--foreground)]/70">
        {query.trim()
          ? "People matching your search"
          : "Suggested people — follow to see them in your circle"}
      </p>

      {error && <p className="text-[13px] text-rose-700">{error}</p>}

      {loading && people.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Searching…</p>
      ) : people.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-base)] px-3 py-10 text-center text-sm text-[var(--muted)]">
          {query.trim() ? "No people found — try another name or @handle." : "No suggestions yet."}
        </p>
      ) : (
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
      )}
    </div>
  );
}
