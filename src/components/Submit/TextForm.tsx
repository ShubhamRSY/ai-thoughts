"use client";

import { PenLine } from "lucide-react";

const MAX_CHARS = 280;

interface TextFormProps {
  value: string;
  onChange: (v: string) => void;
}

export default function TextForm({ value, onChange }: TextFormProps) {
  const remaining = MAX_CHARS - value.length;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
        placeholder="Spill it. What's your raw take on AI right now?"
        rows={5}
        className="w-full resize-none rounded-t-xl bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
      />
      <div className="flex items-center justify-between border-t border-zinc-800/70 px-4 py-2">
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <PenLine className="h-3.5 w-3.5" /> Short, raw, punchy
        </span>
        <span
          className={`font-mono text-[11px] tabular-nums ${
            remaining < 0 ? "text-red-400" : remaining < 40 ? "text-amber-400" : "text-zinc-500"
          }`}
        >
          {remaining}
        </span>
      </div>
    </div>
  );
}
