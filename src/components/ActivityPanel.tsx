"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";

export interface ActivityItem {
  id: string;
  kind: "reply" | "reaction" | "follow_post" | "mention";
  actor_handle: string;
  actor_author: string;
  post_id: string;
  preview: string;
  read: boolean;
  created_at: string;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function useActivity(enabled: boolean) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setUnread(0);
      return;
    }
    try {
      const res = await fetch("/api/activity", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const id = window.setInterval(() => void refresh(), 45000);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  const markAllRead = useCallback(async () => {
    try {
      await fetch("/api/activity", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_all" }),
      });
      setUnread(0);
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    } catch {
      /* ignore */
    }
  }, []);

  return { items, unread, refresh, markAllRead };
}

interface ActivityPanelProps {
  open: boolean;
  onClose: () => void;
  items: ActivityItem[];
  unread: number;
  onMarkAllRead: () => void;
  onSelectPost?: (postId: string) => void;
}

export default function ActivityPanel({
  open,
  onClose,
  items,
  unread,
  onMarkAllRead,
  onSelectPost,
}: ActivityPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close activity"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl border border-[var(--border-base)] bg-[var(--surface)] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-base)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Activity</h2>
            {unread > 0 && (
              <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--surface)]">
                {unread}
              </span>
            )}
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark read
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-2 py-2">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-[var(--muted)]">
              When someone replies or reacts to your take, it shows up here — a reason to come back.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.post_id && onSelectPost) onSelectPost(item.post_id);
                  else onClose();
                }}
                className={`w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--surface-2)] ${
                  item.read ? "" : "bg-[var(--accent-soft)]/40"
                }`}
              >
                <p className="text-sm text-[var(--foreground)]">
                  <span className="font-semibold">{item.actor_author}</span>
                  {item.kind === "reply"
                    ? " replied"
                    : item.kind === "follow_post"
                      ? " shared a take"
                      : item.kind === "mention"
                        ? " mentioned you"
                        : item.preview === "❤️"
                          ? " liked your take"
                          : " reacted"}
                  {item.kind === "reaction" && item.preview !== "❤️" ? ` ${item.preview}` : ""}
                </p>
                {(item.kind === "reply" ||
                  item.kind === "follow_post" ||
                  item.kind === "mention") && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{item.preview}</p>
                )}
                <p className="mt-1 text-[10px] tabular-nums text-[var(--muted)]">
                  {timeAgo(item.created_at)}
                  {item.post_id ? " · Open take" : ""}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
