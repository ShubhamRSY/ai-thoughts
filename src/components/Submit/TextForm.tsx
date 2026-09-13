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
    <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)]">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
        placeholder="How does AI make you feel right now?"
        rows={5}
        dir="auto"
        className="w-full resize-none rounded-t-xl bg-transparent px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:outline-none"
      />
      <div className="flex items-center justify-between border-t border-[var(--border-base)] px-4 py-2">
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <PenLine className="h-3.5 w-3.5" /> Clear, human, and kind
        </span>
        <span
          className={`font-mono text-[11px] tabular-nums ${
            remaining < 0 ? "text-red-600" : remaining < 40 ? "text-amber-600" : "text-[var(--muted)]"
          }`}
        >
          {remaining}
        </span>
      </div>
    </div>
  );
}
