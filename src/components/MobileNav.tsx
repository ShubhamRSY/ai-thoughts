"use client";

import { Home, Heart, User } from "lucide-react";

export type TabId = "home" | "you";

interface MobileNavProps {
  active: TabId;
  onTab: (t: TabId) => void;
  onCreate: () => void;
}

function TabButton({
  id,
  label,
  icon,
  active,
  onSelect,
}: {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onSelect: (t: TabId) => void;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      aria-label={label}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
        active ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {active && (
        <span className="absolute inset-x-1/2 top-0 h-0.5 w-7 -translate-x-1/2 rounded-b bg-[var(--accent)]" />
      )}
      {icon}
      {label}
    </button>
  );
}

export default function MobileNav({ active, onTab, onCreate }: MobileNavProps) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-base)] bg-[var(--surface)]/95 backdrop-blur-md">
      <div className="shell-raw mx-auto flex h-16 w-full items-stretch px-[var(--shell-pad)]">
        <TabButton
          id="home"
          label="Pulse"
          icon={<Home className="h-5 w-5" strokeWidth={2} />}
          active={active === "home"}
          onSelect={onTab}
        />

        <div className="flex flex-1 items-center justify-center">
          <button
            onClick={onCreate}
            aria-label="Share how you feel"
            className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-white transition hover:bg-[var(--accent-2)] active:scale-95"
          >
            <Heart className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <TabButton
          id="you"
          label="You"
          icon={<User className="h-5 w-5" strokeWidth={2} />}
          active={active === "you"}
          onSelect={onTab}
        />
      </div>
    </nav>
  );
}
