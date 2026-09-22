"use client";

import { Home, Plus, Search, Bell, User } from "lucide-react";
import { BRAND } from "@/lib/brand";

export type TabId = "home" | "search" | "activity" | "you";

interface BottomNavProps {
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

export default function BottomNav({ active, onTab, onCreate, activityCount = 0 }: BottomNavProps) {
  const buildButton = ({ id, label, icon: Icon }: { id: TabId; label: string; icon: typeof Home }) => {
    const isActive = active === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onTab(id)}
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
        className={`relative flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-medium transition ${
          isActive
            ? "text-[var(--foreground)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        <Icon className="h-6 w-6 shrink-0" strokeWidth={isActive ? 2.4 : 1.8} />
        {label}
        {id === "activity" && activityCount > 0 && (
          <span className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--surface)]">
            {activityCount > 9 ? "9+" : activityCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav aria-label="App navigation" className="fixed inset-x-0 bottom-0 z-40">
      <div className="tab-bar">
        <div className="mx-auto grid w-full max-w-[var(--shell-max)] grid-cols-5 items-center px-2 py-1.5">
          {buildButton(ITEMS[0])}
          {buildButton(ITEMS[1])}
          <button
            type="button"
            onClick={onCreate}
            aria-label={BRAND.shareCta}
            className="flex h-11 w-11 items-center justify-center self-center justify-self-center rounded-full bg-[var(--accent)] text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
          >
            <Plus className="h-5 w-5 shrink-0" strokeWidth={2.4} />
          </button>
          {buildButton(ITEMS[2])}
          {buildButton(ITEMS[3])}
        </div>
      </div>
    </nav>
  );
}