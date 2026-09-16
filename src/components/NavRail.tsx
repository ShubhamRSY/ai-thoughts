"use client";

import { Home, Plus, User, Bell, Search } from "lucide-react";
import { BRAND } from "@/lib/brand";

export type TabId = "home" | "search" | "activity" | "you";

interface NavRailProps {
  active: TabId;
  onTab: (t: TabId) => void;
  onCreate: () => void;
  activityCount?: number;
}

const ITEMS: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: BRAND.homeNav, icon: Home },
  { id: "search", label: "Search", icon: Search },
  { id: "activity", label: "Activity", icon: Bell },
  { id: "you", label: "You", icon: User },
];

export default function NavRail({ active, onTab, onCreate, activityCount = 0 }: NavRailProps) {
  return (
    <nav className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col items-center gap-1 border-r border-[var(--border-base)] bg-[var(--surface)] py-4 lg:w-56 lg:items-stretch lg:px-3">
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition hover:bg-[var(--surface-2)] lg:w-full ${
              isActive ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <Icon className="h-6 w-6 shrink-0" strokeWidth={isActive ? 2.4 : 1.8} />
            <span className="hidden lg:inline">{label}</span>
            {id === "activity" && activityCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--surface)] lg:static lg:ml-auto">
                {activityCount > 9 ? "9+" : activityCount}
              </span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onCreate}
        aria-label={BRAND.shareCta}
        className="mt-2 flex h-12 w-12 items-center justify-center self-center rounded-full bg-[var(--accent)] text-[var(--surface)] transition hover:bg-[var(--accent-2)] lg:w-full lg:flex-row lg:gap-2"
      >
        <Plus className="h-5 w-5 shrink-0" strokeWidth={2.4} />
        <span className="hidden text-sm font-semibold lg:inline">{BRAND.shareCta}</span>
      </button>
    </nav>
  );
}
