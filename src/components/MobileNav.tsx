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
        active ? "text-violet-300" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {active && (
        <span className="absolute inset-x-1/2 top-0 h-1 w-8 -translate-x-1/2 rounded-b-full bg-gradient-to-r from-violet-500 to-indigo-500" />
      )}
      {icon}
      {label}
    </button>
  );
}

export default function MobileNav({ active, onTab, onCreate }: MobileNavProps) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[430px] items-stretch">
        <TabButton
          id="home"
          label="Pulse"
          icon={<Home className="h-5.5 w-5.5" strokeWidth={2.1} />}
          active={active === "home"}
          onSelect={onTab}
        />

        {/* Center Create button — the camera, IG-style */}
        <div className="flex flex-1 items-center justify-center">
          <button
            onClick={onCreate}
            aria-label="Share how you feel"
            className="animate-heartbeat relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-500/30 transition hover:brightness-110 active:scale-90"
          >
            <Heart className="h-6 w-6" fill="currentColor" strokeWidth={2} />
            <span className="absolute -bottom-1 rounded-full bg-violet-500/20 px-1.5 text-[8px] font-bold uppercase tracking-wider text-violet-200">
              Feel
            </span>
          </button>
        </div>

        <TabButton
          id="you"
          label="You"
          icon={<User className="h-5.5 w-5.5" strokeWidth={2.1} />}
          active={active === "you"}
          onSelect={onTab}
        />
      </div>
    </nav>
  );
}