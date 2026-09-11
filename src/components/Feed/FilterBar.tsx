"use client";

import { AudioLines, Video, Type, LayoutGrid } from "lucide-react";
import { FEELINGS } from "@/lib/feelings";
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

export default function FilterBar({
  media,
  onMediaChange,
  feeling,
  onFeelingChange,
}: FilterBarProps) {
  return (
    <div className="mt-3 space-y-2 border-b border-[var(--border-base)] pb-1">
      <div className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4">
        {MEDIA_FILTERS.map((f) => {
          const active = media === f.id;
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              onClick={() => onMediaChange(f.id)}
              className={`relative shrink-0 px-3 pb-2.5 text-xs transition ${
                active
                  ? "font-semibold text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 opacity-70" />
                {f.label}
              </span>
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-[var(--accent)]" />
              )}
            </button>
          );
        })}
      </div>

      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-2">
        <button
          onClick={() => onFeelingChange("all")}
          className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
            feeling === "all"
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface)] text-[var(--muted)] ring-1 ring-[var(--border-base)] hover:text-[var(--foreground)]"
          }`}
        >
          All feelings
        </button>
        {FEELINGS.map((f) => {
          const active = feeling === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onFeelingChange(f.id)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : `border ${f.chip}`
              }`}
            >
              <span className="mr-1 opacity-70">{f.emoji}</span>
              {f.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
