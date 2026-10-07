"use client";

import { useState } from "react";
import { Plus, LogOut, Send, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { BRAND } from "@/lib/brand";

interface HeaderProps {
  onShare: () => void;
  onOpenProfile: () => void;
  onOpenMessages?: () => void;
  /** Unread chats (requests not included), for the badge. */
  messagesUnread?: number;
}

export default function Header({ onShare, onOpenProfile, onOpenMessages, messagesUnread = 0 }: HeaderProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-[var(--border-base)] bg-[var(--surface)]">
      <div className="app-pad flex min-h-[var(--header-h)] flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
        <div className="min-w-0">
          <p className="font-display truncate text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
            {BRAND.shortName}
          </p>
          <p className="truncate text-[11px] leading-tight text-[var(--muted)]">{BRAND.tagline}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onShare}
            className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Share
          </button>
          {!user && (
            <Link
              href="/sign-in?next=/app"
              className="flex h-9 items-center rounded-full px-3 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              Sign in
            </Link>
          )}
          {user && (
            <>
              {onOpenMessages && (
                <button
                  type="button"
                  onClick={onOpenMessages}
                  aria-label={messagesUnread ? `Messages, ${messagesUnread} unread` : "Messages"}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
                >
                  <Send className="h-[18px] w-[18px]" strokeWidth={2} />
                  {messagesUnread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--surface)]">
                      {messagesUnread > 9 ? "9+" : messagesUnread}
                    </span>
                  )}
                </button>
              )}
              <div className="relative ml-1">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Account menu"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  title={user.displayName}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition hover:ring-2 hover:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:scale-95"
                >
                  {user.displayName.slice(0, 1).toUpperCase()}
                </button>
                {menuOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default"
                      aria-label="Close menu"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div
                      role="menu"
                      className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-lg border border-[var(--border-base)] bg-[var(--surface)] shadow-md"
                    >
                      <p className="truncate border-b border-[var(--border-base)] px-3 py-2 text-xs text-[var(--muted)]">
                        {user.displayName}
                      </p>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenProfile();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                      >
                        <User className="h-3.5 w-3.5" />
                        Your profile
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          void handleSignOut();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
