"use client";

import type { FeelingId, MediaType } from "@/lib/types";

type MediaFilter = "all" | MediaType;
export type FeelingFilter = "all" | FeelingId;

interface FilterBarProps {
  media: MediaFilter;
  onMediaChange: (m: MediaFilter) => void;
  feeling: FeelingFilter;
  onFeelingChange: (f: FeelingFilter) => void;
}

const MEDIA_FILTERS: { id: MediaFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "audio", label: "Audio" },
  { id: "video", label: "Video" },
  { id: "text", label: "Text" },
];

export default function FilterBar({ media, onMediaChange }: FilterBarProps) {
  return (
    <div className="app-pad mt-4 border-y border-[var(--border-base)]">
      <div className="flex gap-5 overflow-x-auto" role="tablist" aria-label="Format">
        {MEDIA_FILTERS.map((f) => {
          const active = media === f.id;
          return (
            <button
              key={f.id}
              type="button"
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
