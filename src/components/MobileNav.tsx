"use client";

import { Home, Plus, User } from "lucide-react";
import { BRAND } from "@/lib/brand";

export type TabId = "home" | "you";

interface MobileNavProps {
  active: TabId;
  onTab: (t: TabId) => void;
  onCreate: () => void;
}

export default function MobileNav({ active, onTab, onCreate }: MobileNavProps) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40">
      <div className="app-rail border-t border-[var(--border-base)] bg-[var(--surface)]">
        <div className="grid h-16 grid-cols-3 items-center">
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
            onClick={onCreate}
            aria-label={BRAND.shareCta}
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
          >
            <Plus className="h-5 w-5" strokeWidth={2.4} />
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
