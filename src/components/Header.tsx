"use client";

import { Plus, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { BRAND } from "@/lib/brand";

interface HeaderProps {
  onShare: () => void;
  /** Left nav rail is currently hidden — if onToggleRail is set the header shows a toggle. */
  railHidden?: boolean;
  onToggleRail?: () => void;
}

export default function Header({ onShare, railHidden, onToggleRail }: HeaderProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-[var(--border-base)] bg-[var(--surface)]">
      <div className="app-pad flex min-h-[var(--header-h)] items-center justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="font-display truncate text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
            {BRAND.shortName}
          </p>
          <p className="truncate text-[11px] leading-tight text-[var(--muted)]">{BRAND.tagline}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onToggleRail && (
            <button
              type="button"
              onClick={onToggleRail}
              aria-label={railHidden ? "Show sidebar" : "Hide sidebar"}
              title="Toggle sidebar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
            >
              {railHidden ? (
                <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={2} />
              ) : (
                <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={2} />
              )}
            </button>
          )}
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
              <span
                className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)]"
                title={user.displayName}
              >
                {user.displayName.slice(0, 1).toUpperCase()}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
