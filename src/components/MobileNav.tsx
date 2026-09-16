"use client";

import { Home, Plus, User, Bell, Search } from "lucide-react";
import { BRAND } from "@/lib/brand";

export type TabId = "home" | "search" | "activity" | "you";

interface MobileNavProps {
  active: TabId;
  onTab: (t: TabId) => void;
  onCreate: () => void;
  activityCount?: number;
}

export default function MobileNav({
  active,
  onTab,
  onCreate,
  activityCount = 0,
}: MobileNavProps) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40">
      <div className="app-rail border-t border-[var(--border-base)] bg-[var(--surface)]">
        <div className="grid h-16 grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => onTab("home")}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              active === "home" ? "text-[var(--foreground)]" : "text-[var(--muted)]"
            }`}
          >
            <Home className="h-5 w-5" strokeWidth={active === "home" ? 2.4 : 1.8} />
            {BRAND.homeNav}
          </button>

          <button
            type="button"
            onClick={() => onTab("search")}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              active === "search" ? "text-[var(--foreground)]" : "text-[var(--muted)]"
            }`}
          >
            <Search className="h-5 w-5" strokeWidth={active === "search" ? 2.4 : 1.8} />
            Search
          </button>

          <button
            type="button"
            onClick={onCreate}
            aria-label={BRAND.shareCta}
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
          >
            <Plus className="h-5 w-5" strokeWidth={2.4} />
          </button>

          <button
            type="button"
            onClick={() => onTab("activity")}
            className={`relative flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              active === "activity" ? "text-[var(--foreground)]" : "text-[var(--muted)]"
            }`}
          >
            <Bell className="h-5 w-5" strokeWidth={active === "activity" ? 2.4 : 1.8} />
            Activity
            {activityCount > 0 && (
              <span className="absolute right-[18%] top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--surface)]">
                {activityCount > 9 ? "9+" : activityCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onTab("you")}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              active === "you" ? "text-[var(--foreground)]" : "text-[var(--muted)]"
            }`}
          >
            <User className="h-5 w-5" strokeWidth={active === "you" ? 2.4 : 1.8} />
            You
          </button>
        </div>
      </div>
    </nav>
  );
}
