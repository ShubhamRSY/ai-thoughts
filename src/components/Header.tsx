"use client";

import { BrainCircuit, Plus } from "lucide-react";

interface HeaderProps {
  onShare: () => void;
}

export default function Header({ onShare }: HeaderProps) {
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[430px] items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg shadow-violet-500/30">
            <BrainCircuit className="h-5 w-5 text-white" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight text-zinc-100">AI·Thoughts</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              The Pulse
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 sm:flex">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Live
          </span>
          <button
            onClick={onShare}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-3 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            <span>Share</span>
          </button>
        </div>
      </div>
    </header>
  );
}