"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, X, MessageCircle, ShieldCheck } from "lucide-react";
import {
  fetchMessages,
  sendMessage,
  subscribeToMessages,
  type ChatMessage,
} from "@/lib/db";
import type { Integrity } from "@/lib/types";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import TranslateToEnglish from "@/components/TranslateToEnglish";

interface ChatPanelProps {
  postId: string;
  postAuthor: string;
  integrity?: Integrity;
  open: boolean;
  onClose: () => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
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

export default function ChatPanel({ postId, postAuthor, integrity, open, onClose }: ChatPanelProps) {
  const { profile } = useLocalProfile();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (!open || !postId) return;

    let cancelled = false;
    void fetchMessages(postId).then((rows) => {
      if (cancelled) return;
      setMessages(rows);
      setLive(true);
      scrollToBottom();
    });

    const off = subscribeToMessages(postId, (msg) => {
      if (cancelled) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      scrollToBottom();
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [open, postId, scrollToBottom]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
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
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        post_id: postId,
        handle: profile.handle || "you",
        author: profile.author || "You",
        body,
        created_at: new Date().toISOString(),
      },
    ]);
    scrollToBottom();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Talk"
        className="relative flex max-h-[min(80dvh,var(--app-height,80dvh))] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[var(--border-base)] bg-[var(--surface)] sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-base)] px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--surface)]">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-[var(--foreground)]">Talk</h3>
              {integrity?.verified && (
                <span title="Verified take" className="text-[var(--accent)]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-[var(--muted)]">
              On {postAuthor}&apos;s take
              {live && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[var(--accent)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  live
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="rounded-full p-2 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={boxRef}
          className="min-h-[12rem] flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MessageCircle className="h-6 w-6 text-[var(--muted)]" />
              <p className="text-sm font-medium text-[var(--foreground)]">No one&apos;s talking yet</p>
              <p className="max-w-[240px] text-xs text-[var(--muted)]">
                Be the first to say something about this take.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex items-start gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[9px] font-bold text-[var(--foreground)]">
                  {initials(m.author || m.handle)}
                </div>
                <div className="min-w-0 flex-1 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-2.5 py-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold text-[var(--foreground)]">
                      {m.handle}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">{timeLabel(m.created_at)}</span>
                  </div>
                  <p dir="auto" className="mt-0.5 break-words text-sm leading-snug text-[var(--foreground)]">
                    {m.body}
                  </p>
                  <TranslateToEnglish text={m.body} variant="dropdown" />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--border-base)] px-4 py-3">
          {error && <p className="mb-2 text-[11px] text-rose-700">{error}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-end gap-2"
          >
            <textarea
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
              placeholder={`Reply to ${postAuthor}…`}
              className="max-h-24 min-h-[40px] flex-1 resize-none rounded-full border border-[var(--border-base)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={sending || !draft.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--surface)] transition hover:bg-[var(--accent-2)] disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
