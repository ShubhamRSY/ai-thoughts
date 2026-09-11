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
    <header className="safe-top sticky top-0 z-40 border-b border-[var(--border-base)]/80 bg-[var(--surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[430px] items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]">
            <BrandMark className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="font-display flex items-center gap-1.5 text-base font-semibold tracking-tight text-[var(--foreground)]">
              AI·Thoughts
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600" aria-hidden />
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              The Pulse
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onShare}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-2)] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            <span>Share</span>
          </button>
          {user && (
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-xs font-bold text-teal-900"
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
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] text-[var(--muted)] transition hover:text-[var(--foreground)] active:scale-[0.98]"
          >
            <LogOut className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </header>
  );
}
