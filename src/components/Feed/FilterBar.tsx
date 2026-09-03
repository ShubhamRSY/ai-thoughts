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

const pill = (active: boolean) =>
  `flex shrink-0 items-center gap-1.5 rounded-full py-1.5 text-xs transition ${
    active
      ? "text-zinc-100"
      : "text-zinc-500 hover:text-zinc-300"
  }`;

export default function FilterBar({
  media,
  onMediaChange,
  feeling,
  onFeelingChange,
}: FilterBarProps) {
  return (
    <div className="mt-4 border-b border-zinc-800/60">
      <div className="no-scrollbar -mx-4 flex items-center gap-4 overflow-x-auto px-4">
        {MEDIA_FILTERS.map((f) => {
          const active = media === f.id;
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              onClick={() => onMediaChange(f.id)}
              className={`relative shrink-0 pb-2.5 ${pill(active)}`}
            >
              <Icon className="hidden h-3.5 w-3.5 sm:block" />
              {f.label}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" />
              )}
            </button>
          );
        })}

        <span className="my-auto h-4 shrink-0 w-px bg-zinc-800/70" />

        <button
          onClick={() => onFeelingChange("all")}
          className={`shrink-0 text-xs transition ${
            feeling === "all" ? "font-semibold text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          All
        </button>
        {FEELINGS.map((f) => {
          const active = feeling === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onFeelingChange(f.id)}
              className={`shrink-0 whitespace-nowrap transition ${
                active ? "font-semibold text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="mr-1">{f.emoji}</span>
              {f.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
