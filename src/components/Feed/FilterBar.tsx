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

export default function FilterBar({ media, onMediaChange }: FilterBarProps) {
  return (
    <div className="mt-4 border-y border-[var(--border-base)] px-[var(--shell-pad)]">
      <div className="flex gap-5 overflow-x-auto" role="tablist" aria-label="Format">
        {MEDIA_FILTERS.map((f) => {
          const active = media === f.id;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={active}
              onClick={() => onMediaChange(f.id)}
              className={`relative shrink-0 py-3 text-sm transition ${
                active
                  ? "font-semibold text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {f.label}
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--foreground)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
