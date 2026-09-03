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
  `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
    active
      ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-sm shadow-violet-500/25"
      : "border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
  }`;

export default function FilterBar({
  media,
  onMediaChange,
  feeling,
  onFeelingChange,
}: FilterBarProps) {
  return (
    <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {MEDIA_FILTERS.map((f) => {
        const active = media === f.id;
        const Icon = f.icon;
        return (
          <button
            key={f.id}
            onClick={() => onMediaChange(f.id)}
            className={pill(active)}
          >
            <Icon className="h-3 w-3" />
            {f.label}
          </button>
        );
      })}

      <span className="my-auto h-5 w-px shrink-0 bg-zinc-800" />

      <button
        onClick={() => onFeelingChange("all")}
        className={pill(feeling === "all")}
      >
        All feels
      </button>
      {FEELINGS.map((f) => (
        <button key={f.id} onClick={() => onFeelingChange(f.id)} className={pill(feeling === f.id)}>
          {f.emoji} {f.short}
        </button>
      ))}
    </div>
  );
}
