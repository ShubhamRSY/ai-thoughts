"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMessages,
  sendMessage,
  subscribeToMessages,
  type ChatMessage,
} from "@/lib/db";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import TranslateToEnglish from "@/components/TranslateToEnglish";
import { checkDignity } from "@/lib/dignity";

interface ChatPanelProps {
  postId: string;
  postAuthor: string;
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}

function timeLabel(iso: string): string {
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

export default function ChatPanel({
  postId,
  postAuthor,
  open,
  onClose,
  onCountChange,
}: ChatPanelProps) {
  const { profile } = useLocalProfile();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

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
        const next = [...prev, msg];
        onCountChange?.(next.length);
        return next;
      });
      requestAnimationFrame(scrollToBottom);
    });

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);

    return () => {
      cancelled = true;
      off();
      window.clearTimeout(focusTimer);
    };
  }, [open, postId, scrollToBottom, onCountChange]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    const dignity = checkDignity(body);
    if (!dignity.ok) {
      setError(dignity.reason);
      return;
    }
    setSending(true);
    setError(null);
    const err = await sendMessage(
      postId,
      profile.handle || "you",
      profile.author || "You",
      body
    );
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setDraft("");
    setMessages((prev) => {
      const next = [
        ...prev,
        {
          id: `local-${Date.now()}`,
          post_id: postId,
          handle: profile.handle || "you",
          author: profile.author || "You",
          body,
          created_at: new Date().toISOString(),
        },
      ];
      onCountChange?.(next.length);
      return next;
    });
    requestAnimationFrame(scrollToBottom);
  };

  if (!open) return null;

  return (
    <div className="mt-4 border-t border-[var(--border-base)] pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--muted)]">
          {loaded
            ? messages.length === 0
              ? "No comments yet"
              : `${messages.length} comment${messages.length === 1 ? "" : "s"}`
            : "Loading comments…"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          Hide
        </button>
      </div>

      <div
        ref={listRef}
        className="max-h-64 space-y-3 overflow-y-auto overscroll-contain pb-1"
      >
        {loaded && messages.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            Be the first to reply to {postAuthor}.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[9px] font-bold text-[var(--foreground)]">
              {(m.author || m.handle).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-[var(--foreground)]">
                <span className="font-semibold">{m.handle}</span>{" "}
                <span dir="auto" className="break-words font-normal">
                  {m.body}
                </span>
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[11px] text-[var(--muted)]">{timeLabel(m.created_at)}</span>
                <TranslateToEnglish text={m.body} variant="dropdown" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        {error && <p className="mb-1.5 text-[11px] text-rose-700">{error}</p>}
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
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            dir="auto"
            placeholder={`Add a comment…`}
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
      </div>
    </div>
  );
}
