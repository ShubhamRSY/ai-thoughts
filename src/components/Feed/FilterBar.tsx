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
    <div className="no-scrollbar mx-4 mt-3 flex gap-1.5 overflow-x-auto py-1">
      {MEDIA_FILTERS.map((f) => {
        const active = media === f.id;
        const Icon = f.icon;
        return (
          <button
            key={f.id}
            onClick={() => onMediaChange(f.id)}
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              active
                ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}
          >
            <Icon className="h-3 w-3" />
            {f.label}
          </button>
        );
      })}

      <span className="my-0.5 w-px shrink-0 bg-zinc-800" />

      <button
        onClick={() => onFeelingChange("all")}
        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
          feeling === "all"
            ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
            : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
        }`}
      >
        All feels
      </button>
      {FEELINGS.map((f) => {
        const active = feeling === f.id;
        return (
          <button
            key={f.id}
            onClick={() => onFeelingChange(f.id)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              active
                ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}
          >
            {f.emoji} {f.short}
          </button>
        );
      })}
    </div>
  );
}
