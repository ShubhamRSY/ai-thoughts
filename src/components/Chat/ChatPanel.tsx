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

interface ChatPanelProps {
  postId: string;
  postAuthor: string;
  integrity?: Integrity;
  open: boolean;
  onClose: () => void;
}

const GRADIENTS = [
  "from-violet-500 to-indigo-500",
  "from-fuchsia-500 to-pink-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
];

function avatarGradient(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return GRADIENTS[h % GRADIENTS.length];
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

  // Load history + subscribe whenever the panel opens
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
    // Optimistically append the local echo if realtime is slow.
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[75vh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-900 shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-zinc-100">Talk</h3>
              <p className="truncate text-[11px] text-zinc-500">
                On {postAuthor}&apos;s take
                {live && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-emerald-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    live
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {integrity && (
            <div
              title={integrity.verified ? "Authentication verified" : "Authentication incomplete"}
              className={`mt-2 flex h-6 w-6 items-center justify-center rounded-full ${
                integrity.verified ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
          )}
        </div>

        {/* Messages */}
        <div
          ref={boxRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="text-2xl">💬</span>
              <p className="text-sm font-medium text-zinc-300">No one&apos;s talking yet</p>
              <p className="max-w-[240px] text-xs text-zinc-500">
                Be the first to say something about this take.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex items-start gap-2">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(
                    m.handle
                  )} text-[9px] font-bold text-white`}
                >
                  {initials(m.author || m.handle)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold text-zinc-200">
                      {m.handle}
                    </span>
                    <span className="text-[10px] text-zinc-500">{timeLabel(m.created_at)}</span>
                  </div>
                  <p dir="auto" className="mt-0.5 break-words text-sm leading-snug text-zinc-300">
                    {m.body}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-zinc-800 px-4 py-3">
          {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}
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
              placeholder={`Say something on ${postAuthor}'s take…`}
              className="max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-violet-600"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={sending || !draft.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white transition hover:brightness-110 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
