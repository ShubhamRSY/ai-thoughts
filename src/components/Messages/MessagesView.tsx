"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Ban, Flag, MessageCircle, Send, Trash2 } from "lucide-react";
import ReportDialog from "@/components/ReportDialog";
import { timeLabel } from "@/components/Chat/ChatPanel";
import {
  dmAction,
  fetchDmThread,
  replyDm,
  reportAccount,
  reportChat,
  sendDmTo,
  type Dm,
  type DmPerson,
  type DmThread,
  type Inbox,
} from "@/lib/db";
import { firstName } from "@/lib/display-name";
import { useAutoGrow } from "@/hooks/useAutoGrow";

const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");

function Avatar({ name, size = "h-11 w-11 text-sm" }: { name: string; size?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-semibold text-[var(--foreground)] ${size}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/**
 * Instagram-style messages: an inbox (with a Requests tab) and a thread.
 * The page owns which conversation is open and the inbox data, so the header
 * badge and this view share one poll.
 */
export default function MessagesView({
  inbox,
  openId,
  composeTo,
  onOpen,
  onBack,
  onOpenProfile,
  onChanged,
}: {
  inbox: Inbox | null;
  /** Conversation to show; null = the inbox (or a fresh compose, see composeTo). */
  openId: string | null;
  /** Start a conversation with someone you haven't messaged yet. */
  composeTo: DmPerson | null;
  onOpen: (id: string) => void;
  onBack: () => void;
  onOpenProfile: (handle: string) => void;
  /** Something changed (sent, accepted, deleted, blocked): refresh the inbox. */
  onChanged: () => void;
}) {
  // A profile's "Message" button lands here; reuse the thread if one exists.
  const existing = composeTo
    ? inbox?.items.find((i) => norm(i.other.handle) === norm(composeTo.handle))
    : undefined;
  const threadId = openId ?? existing?.id ?? null;

  if (threadId || composeTo) {
    return (
      <Thread
        key={threadId ?? `new:${composeTo?.handle}`}
        id={threadId}
        composeTo={threadId ? null : composeTo}
        onCreated={onOpen}
        onBack={onBack}
        onOpenProfile={onOpenProfile}
        onChanged={onChanged}
      />
    );
  }
  return <InboxList inbox={inbox} onOpen={onOpen} />;
}

function InboxList({ inbox, onOpen }: { inbox: Inbox | null; onOpen: (id: string) => void }) {
  const [showRequests, setShowRequests] = useState(false);
  const items = (inbox?.items ?? []).filter((i) => i.request === showRequests);

  return (
    <div className="app-pad pt-4">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="font-display text-lg font-bold text-[var(--foreground)]">Messages</h1>
      </div>
      <div className="mb-3 flex gap-2" role="tablist">
        {[
          { requests: false, label: "Chats" },
          { requests: true, label: `Requests${inbox?.requests ? ` (${inbox.requests})` : ""}` },
        ].map((t) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={showRequests === t.requests}
            onClick={() => setShowRequests(t.requests)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              showRequests === t.requests
                ? "bg-[var(--foreground)] text-[var(--surface)]"
                : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!inbox && <p className="text-sm text-[var(--muted)]">Loading…</p>}
      {inbox && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <MessageCircle className="h-8 w-8 text-[var(--muted)]" />
          <p className="max-w-xs text-sm text-[var(--muted)]">
            {showRequests
              ? "No requests. Messages from people you don’t follow show up here first."
              : "Felt something in someone’s take? Open their profile and tap Message to talk one-on-one."}
          </p>
        </div>
      )}

      <ul className="divide-y divide-[var(--border-base)]">
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onOpen(i.id)}
              className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-[var(--surface-2)]/50"
            >
              <Avatar name={firstName(i.other.displayName, i.other.handle)} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm text-[var(--foreground)] ${i.unread ? "font-bold" : "font-semibold"}`}>
                  {firstName(i.other.displayName, i.other.handle)}
                </p>
                <p className={`truncate text-[13px] ${i.unread ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                  {i.last_from_me ? "You: " : ""}
                  {i.last_preview} · {timeLabel(i.last_message_at)}
                </p>
              </div>
              {i.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]" aria-label="Unread" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thread({
  id,
  composeTo,
  onCreated,
  onBack,
  onOpenProfile,
  onChanged,
}: {
  id: string | null;
  composeTo: DmPerson | null;
  onCreated: (id: string) => void;
  onBack: () => void;
  onOpenProfile: (handle: string) => void;
  onChanged: () => void;
}) {
  const [thread, setThread] = useState<DmThread | null>(null);
  const [messages, setMessages] = useState<Dm[]>([]);
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(draftRef, draft);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | undefined>(undefined);

  const other = thread?.other ?? composeTo;

  const append = (rows: Dm[]) => {
    if (!rows.length) return;
    lastAt.current = rows[rows.length - 1].created_at;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...rows.filter((m) => !seen.has(m.id))];
    });
  };

  // Load, then poll for new messages. A failed poll is just skipped.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const t = await fetchDmThread(id, lastAt.current);
        if (cancelled) return;
        setThread(t);
        append(t.messages);
      } catch {
        /* try again next tick */
      } finally {
        inFlight = false;
      }
    };
    void poll().then(onChanged); // opening marks it read — refresh the badge
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll once per conversation
  }, [id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || !other) return;
    setSending(true);
    setError(null);
    const res = id ? await replyDm(id, body) : await sendDmTo(other.handle, body);
    setSending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setDraft("");
    append([res.message]);
    if (thread?.request) setThread({ ...thread, request: false }); // replying accepts
    onChanged();
    if (!id) onCreated(res.conversationId);
  };

  const act = async (action: "accept" | "delete") => {
    if (!id) return;
    if (action === "delete" && !window.confirm("Delete this chat? It's removed for you only.")) return;
    if (await dmAction(id, action)) {
      onChanged();
      if (action === "delete") onBack();
      else if (thread) setThread({ ...thread, request: false });
    }
  };

  const block = async () => {
    if (!other || !window.confirm(`Block ${firstName(other.displayName, other.handle)}? They won't be able to message you, and they won't be told.`)) return;
    const res = await fetch("/api/blocks", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: other.handle, action: "block" }),
    });
    if (res.ok) {
      onChanged();
      onBack();
    }
  };

  const canReply = thread ? thread.can_reply : Boolean(composeTo);

  return (
    <div data-dm-thread className="flex h-[calc(100dvh-var(--header-live,var(--header-h))-var(--tabbar-h)-env(safe-area-inset-bottom,0px))] flex-col">
      {reporting && other && (
        <ReportDialog
          subject={id ? "conversation" : "account"}
          signedIn
          // A reported chat lets keepers read it (up to now) to act on it.
          onSubmit={(reason) => (id ? reportChat(id, reason) : reportAccount(other.handle, reason))}
          onClose={() => setReporting(false)}
        />
      )}

      <div className="app-pad flex items-center gap-2 border-b border-[var(--border-base)] py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to messages"
          className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {other && (
          <button type="button" onClick={() => onOpenProfile(other.handle)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Avatar name={firstName(other.displayName, other.handle)} size="h-8 w-8 text-xs" />
            <span className="block min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">
              {firstName(other.displayName, other.handle)}
            </span>
          </button>
        )}
        {other && (
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={() => setReporting(true)} aria-label="Report" title="Report" className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-rose-700">
              <Flag className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void block()} aria-label="Block" title="Block" className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-rose-700">
              <Ban className="h-4 w-4" />
            </button>
            {id && (
              <button type="button" onClick={() => void act("delete")} aria-label="Delete chat" title="Delete chat" className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-rose-700">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div ref={listRef} className="app-pad flex-1 space-y-1.5 overflow-y-auto overscroll-contain py-3">
        {messages.length === 0 && other && (
          <p className="py-8 text-center text-sm text-[var(--muted)]">
            {id ? "Loading…" : `Say hi to ${firstName(other.displayName, other.handle)} — tell them what their take made you feel.`}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
            <p
              dir="auto"
              title={timeLabel(m.created_at)}
              className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                m.from_me
                  ? "rounded-br-md bg-[var(--accent)] text-[var(--surface)]"
                  : "rounded-bl-md bg-[var(--surface-2)] text-[var(--foreground)]"
              }`}
            >
              {m.body}
            </p>
          </div>
        ))}
      </div>

      {thread?.request && other ? (
        <div className="app-pad border-t border-[var(--border-base)] py-3">
          <p className="mb-2 text-center text-[13px] text-[var(--muted)]">
            {firstName(other.displayName, other.handle)} wants to message you. Accept to move this to your chats.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void act("delete")} className="flex-1 rounded-full border border-[var(--border-base)] py-2 text-sm font-semibold text-rose-700">
              Delete
            </button>
            <button type="button" onClick={() => void act("accept")} className="flex-1 rounded-full bg-[var(--accent)] py-2 text-sm font-semibold text-[var(--surface)]">
              Accept
            </button>
          </div>
        </div>
      ) : canReply ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="app-pad border-t border-[var(--border-base)] py-2"
        >
          {error && <p className="mb-1 text-[11px] text-rose-700">{error}</p>}
          <div className="flex items-end gap-2 rounded-3xl border border-[var(--border-base)] px-3 py-1">
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={1000}
              dir="auto"
              aria-label="Message"
              placeholder="Message…"
              className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={sending || !draft.trim()}
              className="mb-1 rounded-full p-1.5 text-[var(--accent)] transition disabled:opacity-40"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      ) : (
        thread && (
          <p className="app-pad border-t border-[var(--border-base)] py-3 text-center text-[13px] text-[var(--muted)]">
            You can’t reply to this conversation.
          </p>
        )
      )}
    </div>
  );
}
