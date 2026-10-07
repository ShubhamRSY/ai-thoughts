"use client";

import { Bell, CheckCheck, ShieldAlert, UserPlus, X } from "lucide-react";
import type { ActivityItem } from "@/components/ActivityPanel";

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface ActivityViewProps {
  items: ActivityItem[];
  unread: number;
  signedIn: boolean;
  following: string[];
  onMarkAllRead: () => void;
  /** Tapping a notification marks it seen. */
  onMarkRead: (id: string) => void;
  onClear: (id: string) => void;
  onClearAll: () => void;
  onSelectPost?: (postId: string) => void;
  onUnfollow?: (handle: string) => void;
  onInvite?: () => void;
  onOpenSearch?: () => void;
  onOpenDevices?: () => void;
}

export default function ActivityView({
  items,
  unread,
  signedIn,
  following,
  onMarkAllRead,
  onMarkRead,
  onClear,
  onClearAll,
  onSelectPost,
  onUnfollow,
  onInvite,
  onOpenSearch,
  onOpenDevices,
}: ActivityViewProps) {
  if (!signedIn) {
    return (
      <div className="app-pad py-10 text-center">
        <Bell className="mx-auto h-8 w-8 text-[var(--muted)]" />
        <p className="mt-3 text-sm font-medium text-[var(--foreground)]">Activity</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Sign in to see replies, likes, and people you follow.
        </p>
      </div>
    );
  }

  return (
    <div className="app-pad space-y-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[var(--accent)]" />
          <h1 className="text-base font-semibold text-[var(--foreground)]">Activity</h1>
          {unread > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--surface)]">
              {unread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--foreground)]/70 hover:text-[var(--foreground)]"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Clear all notifications?")) onClearAll();
              }}
              className="text-[12px] font-semibold text-[var(--foreground)]/70 hover:text-rose-700"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-[12px] font-semibold text-[var(--foreground)] hover:border-[var(--accent)]"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite people
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="rounded-full border border-[var(--border-base)] px-3 py-1.5 text-[12px] font-semibold text-[var(--foreground)]/70 hover:text-[var(--foreground)]"
        >
          Find people
        </button>
      </div>

      <section>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--foreground)]/70">
          Updates
        </h2>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border-base)] px-3 py-8 text-center text-sm text-[var(--muted)]">
            Replies and likes on your takes show up here.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-base)] rounded-xl border border-[var(--border-base)] bg-[var(--surface)]">
            {items.map((item) => (
              <div key={item.id} className="relative">
                {
                  // A new sign-in is about the reader's own account, not another
                  // member, so it gets its own row: no actor name, no avatar, and it
                  // opens the device list rather than a post.
                  item.kind === "new_signin" ? (
                    <button
                      type="button"
                      onClick={() => {
                        onMarkRead(item.id);
                        onOpenDevices?.();
                      }}
                      className={`flex w-full items-start gap-2.5 py-2.5 pl-3 pr-10 text-left transition hover:bg-[var(--surface-2)] ${
                        item.read ? "" : "bg-[var(--accent-soft)]/30"
                      }`}
                    >
                      <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-[var(--foreground)]">
                          New sign-in · {item.preview}
                        </span>
                        <span className="block text-[13px] text-[var(--foreground)]/70">
                          {timeAgo(item.created_at)} · review or end it in Account → Devices
                        </span>
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onMarkRead(item.id);
                        if (item.post_id && onSelectPost) onSelectPost(item.post_id);
                      }}
                      className={`w-full py-2.5 pl-3 pr-10 text-left transition hover:bg-[var(--surface-2)] ${
                        item.read ? "" : "bg-[var(--accent-soft)]/30"
                      }`}
                    >
                      <p className="text-[15px] text-[var(--foreground)]">
                        <span className="font-semibold">{item.actor_author}</span>
                        {item.kind === "reply"
                          ? " replied"
                          : item.kind === "follow_post"
                            ? " shared a take"
                            : item.kind === "mention"
                              ? " mentioned you"
                              : item.preview === "❤️"
                                ? " felt the same 🫂"
                                : " reacted"}
                        {item.kind === "reaction" && item.preview !== "❤️" ? ` ${item.preview}` : ""}
                      </p>
                      {(item.kind === "reply" ||
                        item.kind === "follow_post" ||
                        item.kind === "mention") && (
                        <p className="mt-0.5 line-clamp-2 text-[13px] text-[var(--foreground)]/70">
                          {item.preview}
                        </p>
                      )}
                      <p className="mt-1 text-[12px] tabular-nums text-[var(--foreground)]/60">
                        {timeAgo(item.created_at)}
                        {item.post_id ? " · Open" : ""}
                      </p>
                    </button>
                  )
                }
                <button
                  type="button"
                  onClick={() => onClear(item.id)}
                  aria-label="Clear notification"
                  title="Clear"
                  className="absolute right-2 top-2.5 rounded-full p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--foreground)]/70">
          Following · {following.length}
        </h2>
        {following.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Follow someone from a take (··· menu) to see them in your circle feed.
          </p>
        ) : (
          <ul className="space-y-1">
            {following.map((h) => (
              <li
                key={h}
                className="flex items-center justify-between rounded-lg px-2 py-2 text-sm"
              >
                <span className="font-medium text-[var(--foreground)]">
                  {h.startsWith("@") ? h : `@${h}`}
                </span>
                {onUnfollow && (
                  <button
                    type="button"
                    onClick={() => onUnfollow(h)}
                    className="text-[12px] font-semibold text-[var(--foreground)]/60 hover:text-rose-700"
                  >
                    Unfollow
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
