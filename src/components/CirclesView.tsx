"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Link2, Plus, Users } from "lucide-react";

export type CircleSummary = {
  slug: string;
  name: string;
  description: string;
  member_count: number;
  joined: boolean;
  creator_author?: string;
};

type CircleMessage = {
  handle: string;
  author: string;
  body: string;
  created_at: string;
};

interface CirclesViewProps {
  signedIn: boolean;
  onNeedSignIn?: () => void;
  initialSlug?: string | null;
}

export default function CirclesView({
  signedIn,
  onNeedSignIn,
  initialSlug = null,
}: CirclesViewProps) {
  const [list, setList] = useState<CircleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(initialSlug);
  const [detail, setDetail] = useState<CircleSummary | null>(null);
  const [messages, setMessages] = useState<CircleMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/communities", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn’t load pages");
        return;
      }
      setList(data.communities ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const openCircle = useCallback(async (slug: string) => {
    setActive(slug);
    setError(null);
    try {
      const [cRes, mRes] = await Promise.all([
        fetch(`/api/communities/${encodeURIComponent(slug)}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/communities/${encodeURIComponent(slug)}/messages`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const cData = await cRes.json();
      const mData = await mRes.json();
      if (!cRes.ok) {
        setError(cData.error || "Page not found");
        setActive(null);
        return;
      }
      setDetail(cData.community);
      setMessages(mData.messages ?? []);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
    } catch {
      setError("Couldn’t open page");
      setActive(null);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (initialSlug) void openCircle(initialSlug);
  }, [initialSlug, openCircle]);

  const create = async () => {
    if (!signedIn) {
      onNeedSignIn?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn’t create");
        return;
      }
      setName("");
      setDescription("");
      setCreating(false);
      await refreshList();
      if (data.community?.slug) void openCircle(data.community.slug);
    } catch {
      setError("Couldn’t create page");
    } finally {
      setBusy(false);
    }
  };

  const joinOrLeave = async (join: boolean) => {
    if (!signedIn || !active) {
      onNeedSignIn?.();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${encodeURIComponent(active)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: join ? "join" : "leave" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn’t update");
        return;
      }
      setDetail((d) => (d ? { ...d, joined: Boolean(data.joined) } : d));
      await refreshList();
    } catch {
      setError("Couldn’t update membership");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!signedIn || !active || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${encodeURIComponent(active)}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn’t send");
        return;
      }
      setDraft("");
      setMessages((prev) => [...prev, data.message]);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
    } catch {
      setError("Couldn’t send");
    } finally {
      setBusy(false);
    }
  };

  const inviteLink = async () => {
    if (!active) return;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/c/${encodeURIComponent(active)}`
        : `/c/${active}`;
    const text = detail
      ? `Join “${detail.name}” on AiTo — ${url}`
      : `Join this AiTo page — ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: detail?.name || "AiTo page", text, url });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  if (active && detail) {
    return (
      <div className="app-pad flex min-h-[70dvh] flex-col py-3">
        <div className="mb-3 flex items-start gap-2">
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              setActive(null);
              setDetail(null);
              setMessages([]);
            }}
            className="mt-0.5 rounded-md p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-[var(--foreground)]">
              {detail.name}
            </h1>
            <p className="text-[12px] text-[var(--foreground)]/70">
              {detail.member_count} member{detail.member_count === 1 ? "" : "s"}
              {detail.description ? ` · ${detail.description}` : ""}
            </p>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {detail.joined ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void joinOrLeave(false)}
              className="rounded-full border border-[var(--border-base)] px-3 py-1.5 text-[12px] font-semibold text-[var(--foreground)]/70"
            >
              Leave
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void joinOrLeave(true)}
              className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--surface)]"
            >
              Join
            </button>
          )}
          <button
            type="button"
            onClick={() => void inviteLink()}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-[12px] font-semibold"
          >
            <Link2 className="h-3.5 w-3.5" />
            {copied ? "Link copied" : "Invite"}
          </button>
        </div>

        {error && <p className="mb-2 text-[13px] text-rose-700">{error}</p>}

        <div
          ref={listRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-[var(--border-base)] bg-[var(--surface)] p-3"
        >
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              No messages yet — say hello.
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={`${m.created_at}-${i}`}>
                <p className="text-[15px] leading-snug text-[var(--foreground)]">
                  <span className="font-semibold">{m.handle}</span> {m.body}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--foreground)]/60">
                  {new Date(m.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))
          )}
        </div>

        {detail.joined ? (
          <form
            className="mt-3 flex items-end gap-2 border-t border-[var(--border-base)] pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              placeholder="Write in this page…"
              className="max-h-24 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-[var(--muted)]"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="shrink-0 text-sm font-semibold text-[var(--accent)] disabled:opacity-40"
            >
              Post
            </button>
          </form>
        ) : (
          <p className="mt-3 text-center text-sm text-[var(--muted)]">
            {signedIn ? "Join to post here." : "Sign in to join and post."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="app-pad space-y-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--accent)]" />
          <h1 className="text-base font-semibold text-[var(--foreground)]">Circles</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!signedIn) {
              onNeedSignIn?.();
              return;
            }
            setCreating((v) => !v);
          }}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--surface)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Create page
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Make a page for a topic or group — invite people, join, and talk there.
      </p>

      {creating && (
        <div className="space-y-2 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Page name"
            maxLength={60}
            className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this page for? (optional)"
            maxLength={280}
            rows={2}
            className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={() => void create()}
            className="w-full rounded-full bg-[var(--accent)] py-2 text-sm font-semibold text-[var(--surface)] disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {error && <p className="text-[13px] text-rose-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-base)] px-3 py-10 text-center text-sm text-[var(--muted)]">
          No pages yet — create one and invite friends.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => void openCircle(c.slug)}
                className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-3 text-left transition hover:border-[var(--accent)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--foreground)]">{c.name}</span>
                  <span className="shrink-0 text-[12px] text-[var(--foreground)]/60">
                    {c.member_count} · {c.joined ? "Joined" : "Open"}
                  </span>
                </div>
                {c.description && (
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-[var(--foreground)]/70">
                    {c.description}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12px] text-[var(--muted)]">
        Share links look like{" "}
        <Link href="/c/example" className="text-[var(--accent)] hover:underline">
          /c/your-page
        </Link>
        .
      </p>
    </div>
  );
}
