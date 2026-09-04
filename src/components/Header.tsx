"use client";

import { Plus, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import BrandMark from "@/components/BrandMark";

interface HeaderProps {
  onShare: () => void;
}

export default function Header({ onShare }: HeaderProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[430px] items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg shadow-violet-500/30">
            <BrandMark className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5 text-base font-bold tracking-tight text-zinc-100">
              AI·Thoughts
              <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              The Pulse
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onShare}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-3.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 active:scale-95"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            <span>Share</span>
          </button>
          {user && (
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/70 to-indigo-500/70 text-xs font-bold text-white"
              title={`Signed in as ${user.displayName} (${user.handle})`}
              aria-hidden
            >
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 active:scale-95"
          >
            <LogOut className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </header>
  );
}