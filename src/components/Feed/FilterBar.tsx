"use client";

import { AudioLines, Video, Type, LayoutGrid } from "lucide-react";
import type { FeelingId, MediaType } from "@/lib/types";

type MediaFilter = "all" | MediaType;
export type FeelingFilter = "all" | FeelingId;

interface FilterBarProps {
  media: MediaFilter;
  onMediaChange: (m: MediaFilter) => void;
  feeling: FeelingFilter;
  onFeelingChange: (f: FeelingFilter) => void;
}

const MEDIA_FILTERS: { id: MediaFilter; label: string; icon: typeof LayoutGrid }[] = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "video", label: "Video", icon: Video },
  { id: "text", label: "Text", icon: Type },
];

/** Media-only filter — feelings are chosen from the Live mood card above. */
export default function FilterBar({
  media,
  onMediaChange,
}: FilterBarProps) {
  return (
    <div className="mt-4 px-[var(--shell-pad)]">
      <div
        role="tablist"
        aria-label="Filter by format"
        className="inline-flex w-full max-w-full overflow-x-auto rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] p-1"
      >
        {MEDIA_FILTERS.map((f) => {
          const active = media === f.id;
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={active}
              onClick={() => onMediaChange(f.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                active
                  ? "bg-white text-[var(--foreground)] shadow-sm shadow-slate-900/5"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2.2} />
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
