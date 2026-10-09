"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMessages,
  reportComment,
  sendMessage,
  subscribeToMessages,
  type ChatMessage,
} from "@/lib/db";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import { useAuth } from "@/hooks/useAuth";
import {
  mentionQueryAt,
  normHandle,
  splitMentionParts,
  type MentionPerson,
} from "@/lib/mentions";
import VerifiedBadge from "@/components/VerifiedBadge";
import ReportDialog from "@/components/ReportDialog";
import Link from "next/link";
import { firstName } from "@/lib/display-name";

interface ChatPanelProps {
  postId: string;
  postAuthor: string;
  /** Handle of the take’s author — used for @ suggestions + quick mention. */
  postHandle?: string | null;
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}

export function timeLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function CommentBody({ body }: { body: string }) {
  const parts = splitMentionParts(body);
  return (
    <span dir="auto" className="break-words font-normal">
      {parts.map((p, i) =>
        p.type === "mention" ? (
          <span key={i} className="font-semibold text-[var(--accent)]">
            {p.value}
          </span>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </span>
  );
}

export default function ChatPanel({
  postId,
  postAuthor,
  postHandle,
  open,
  onClose,
  onCountChange,
}: ChatPanelProps) {
  const { profile } = useLocalProfile();
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reportFor, setReportFor] = useState<ChatMessage | null>(null);
  const [caret, setCaret] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [keyboardPad, setKeyboardPad] = useState(0);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const sync = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setKeyboardPad(0);
        return;
      }
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardPad(covered > 40 ? covered : 0);
    };
    sync();
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    return () => {
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
    };
  }, [open]);

  const me = normHandle(profile.handle || "");

  const people = useMemo(() => {
    const map = new Map<string, MentionPerson>();
    if (postHandle) {
      const key = normHandle(postHandle);
      if (key && key !== me) {
        map.set(key, {
          handle: postHandle.startsWith("@") ? postHandle : `@${key}`,
          author: postAuthor || key,
        });
      }
    }
    for (const m of messages) {
      const key = normHandle(m.handle);
      if (!key || key === me || map.has(key)) continue;
      map.set(key, {
        handle: m.handle.startsWith("@") ? m.handle : `@${key}`,
        author: m.author || key,
      });
    }
    return [...map.values()];
  }, [messages, postHandle, postAuthor, me]);

  const activeMention = mentionQueryAt(draft, caret);
  const suggestions = useMemo(() => {
    if (!activeMention || !suggestOpen) return [];
    const q = activeMention.query;
    return people
      .filter((p) => {
        const h = normHandle(p.handle);
        const a = p.author.toLowerCase();
        return !q || h.startsWith(q) || a.startsWith(q);
      })
      .slice(0, 6);
  }, [activeMention, people, suggestOpen]);

  useEffect(() => {
    if (!open || !postId) return;

    let cancelled = false;
    setLoaded(false);
    void fetchMessages(postId).then((rows) => {
      if (cancelled) return;
      setMessages(rows);
      setLoaded(true);
      onCountChange?.(rows.length);
      requestAnimationFrame(scrollToBottom);
    });

    const off = subscribeToMessages(postId, (msg) => {
      if (cancelled) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const key = normHandle(msg.handle);
        const withoutDup = prev.filter(
          (m) =>
            !(
              m.id.startsWith("local-") &&
              normHandle(m.handle) === key &&
              m.body.trim() === msg.body.trim()
            )
        );
        const next = [...withoutDup, msg];
        onCountChange?.(next.length);
        return next;
      });
      requestAnimationFrame(scrollToBottom);
    });

    const focusTimer = window.setTimeout(() => {
      // Autofocus opens the mobile keyboard and covers the composer — only on fine pointers.
      const fine = window.matchMedia("(pointer: fine)").matches;
      if (fine) inputRef.current?.focus();
      composerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);

    return () => {
      cancelled = true;
      off();
      window.clearTimeout(focusTimer);
    };
  }, [open, postId, scrollToBottom, onCountChange]);

  const insertMention = (person: MentionPerson) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? caret;
    const mq = mentionQueryAt(draft, pos);
    const handle = person.handle.startsWith("@")
      ? person.handle
      : `@${normHandle(person.handle)}`;
    let next: string;
    let nextCaret: number;
    if (mq) {
      next = `${draft.slice(0, mq.start)}${handle} ${draft.slice(mq.end)}`;
      nextCaret = mq.start + handle.length + 1;
    } else {
      const prefix = draft && !draft.endsWith(" ") ? `${draft} ` : draft;
      next = `${prefix}${handle} `;
      nextCaret = next.length;
    }
    setDraft(next);
    setSuggestOpen(false);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  };

  const handleSend = async () => {
    if (!signedIn) {
      setError("Sign in to reply");
      return;
    }
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const handle = user?.handle || profile.handle || "you";
    const author = user?.displayName || profile.author || "You";
    const localId = `local-${Date.now()}`;
    setMessages((prev) => {
      const next = [
        ...prev,
        {
          id: localId,
          post_id: postId,
          handle,
          author,
          body,
          created_at: new Date().toISOString(),
        },
      ];
      onCountChange?.(next.length);
      return next;
    });
    setDraft("");
    setSuggestOpen(false);
    requestAnimationFrame(scrollToBottom);

    const result = await sendMessage(postId, handle, author, body);
    setSending(false);
    if ("error" in result) {
      setError(result.error);
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== localId);
        onCountChange?.(next.length);
        return next;
      });
      return;
    }
    setMessages((prev) => {
      const withoutLocal = prev.filter(
        (m) =>
          m.id !== localId &&
          !(
            m.id.startsWith("local-") &&
            normHandle(m.handle) === normHandle(handle) &&
            m.body.trim() === body
          )
      );
      if (withoutLocal.some((m) => m.id === result.id)) {
        onCountChange?.(withoutLocal.length);
        return withoutLocal;
      }
      const next = [
        ...withoutLocal,
        {
          id: result.id,
          post_id: postId,
          handle,
          author,
          body,
          created_at: new Date().toISOString(),
        },
      ];
      onCountChange?.(next.length);
      return next;
    });
  };

  if (!open) return null;

  const authorPerson: MentionPerson | null = postHandle
    ? {
        handle: postHandle.startsWith("@")
          ? postHandle
          : `@${normHandle(postHandle)}`,
        author: postAuthor,
      }
    : null;

  const commentLabel = !loaded
    ? "Loading comments…"
    : messages.length === 0
      ? "No comments yet"
      : `${messages.length} comment${messages.length === 1 ? "" : "s"}`;

  return (
    <div className="mt-4 border-t border-[var(--border-base)] pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-[var(--foreground)]/70">{commentLabel}</p>
        <div className="flex items-center gap-2">
          {signedIn && authorPerson && me !== normHandle(authorPerson.handle) && (
            <button
              type="button"
              onClick={() => insertMention(authorPerson)}
              className="text-[13px] font-semibold text-[var(--accent)] hover:underline"
            >
              @{normHandle(authorPerson.handle)}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-medium text-[var(--foreground)]/70 hover:text-[var(--foreground)]"
          >
            Close
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        className="max-h-64 space-y-3 overflow-y-auto overscroll-contain pb-1"
      >
        {loaded && messages.length === 0 && (
          <p className="text-[15px] text-[var(--foreground)]/70">
            Be the first to reply.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[9px] font-bold text-[var(--foreground)]">
              {firstName(m.author, m.handle).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-snug text-[var(--user-ink)]">
                <span className="font-semibold" title={m.handle}>{firstName(m.author, m.handle)}</span>
                {m.authorVerified && (
                  <span className="mx-1 inline-flex text-sky-500">
                    <VerifiedBadge className="h-3.5 w-3.5" />
                  </span>
                )}
{" "}
                <CommentBody body={m.body} />
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[13px] text-[var(--foreground)]/70">{timeLabel(m.created_at)}</span>
                {signedIn && !m.id.startsWith("local-") && (
                  <button
                    type="button"
                    onClick={() => setReportFor(m)}
                    className="text-[13px] font-medium text-[var(--foreground)]/50 hover:text-rose-600"
                  >
                    Report
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="relative mt-3 border-t border-[var(--border-base)] bg-[var(--surface)] pt-3"
        ref={composerRef}
        style={keyboardPad ? { paddingBottom: keyboardPad } : undefined}
      >
        {error && <p className="mb-1.5 text-[11px] text-rose-700">{error}</p>}
        {!signedIn ? (
          <p className="border-t border-[var(--border-base)] pt-3 text-sm text-[var(--muted)]">
            <Link href="/sign-in" className="font-semibold text-[var(--accent)] hover:underline">
              Sign in
            </Link>{" "}
            to reply.
          </p>
        ) : (
          <>
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-1 w-full max-w-xs overflow-hidden rounded-xl border border-[var(--border-base)] bg-[var(--surface)] shadow-md">
            <p className="border-b border-[var(--border-base)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Mention
            </p>
            {suggestions.map((p) => (
              <button
                key={normHandle(p.handle)}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(p);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <span className="font-semibold text-[var(--accent)]">
                  @{normHandle(p.handle)}
                </span>
                <span className="truncate text-[var(--muted)]">{p.author}</span>
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex items-center gap-2 border-t border-[var(--border-base)] pt-3"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              const pos = e.target.selectionStart ?? v.length;
              setDraft(v);
              setCaret(pos);
              setSuggestOpen(Boolean(mentionQueryAt(v, pos)));
            }}
            onSelect={(e) => {
              const pos = (e.target as HTMLTextAreaElement).selectionStart ?? 0;
              setCaret(pos);
              setSuggestOpen(Boolean(mentionQueryAt(draft, pos)));
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSuggestOpen(false);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                if (suggestions.length > 0 && suggestOpen) {
                  e.preventDefault();
                  insertMention(suggestions[0]);
                  return;
                }
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            dir="auto"
            aria-label="Write a reply"
            placeholder="Write a reply…"
            className="max-h-24 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none"
          />
          <button
            type="submit"
            aria-label="Post comment"
            disabled={sending || !draft.trim()}
            className="shrink-0 text-sm font-semibold text-[var(--accent)] transition disabled:opacity-40"
          >
            {sending ? "…" : "Post"}
          </button>
        </form>
          </>
        )}
      </div>

      {reportFor && (
        <ReportDialog
          subject="comment"
          signedIn={signedIn}
          onSubmit={(reason) => reportComment(reportFor.id, reason)}
          onClose={() => setReportFor(null)}
        />
      )}
    </div>
  );
}
