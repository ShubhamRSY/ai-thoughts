"use client";

import { AudioLines, Video, Type, LayoutGrid, SlidersHorizontal } from "lucide-react";
import { TAG_OPTIONS } from "@/lib/mock-data";
import { FEELINGS } from "@/lib/feelings";
import type { FeelingId, MediaType } from "@/lib/types";

type MediaFilter = "all" | MediaType;
export type FeelingFilter = "all" | FeelingId;

interface FilterBarProps {
  media: MediaFilter;
  onMediaChange: (m: MediaFilter) => void;
  feeling: FeelingFilter;
  onFeelingChange: (f: FeelingFilter) => void;
  tags: string[];
  onTagToggle: (t: string) => void;
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
  tags,
  onTagToggle,
}: FilterBarProps) {
  return (
    <div className="border-b border-zinc-800/70 bg-zinc-950/50">
      <div className="mx-auto max-w-[430px] px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-zinc-600" />
          {MEDIA_FILTERS.map((f) => {
            const active = media === f.id;
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                onClick={() => onMediaChange(f.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            Feel
          </span>
          <button
            onClick={() => onFeelingChange("all")}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              feeling === "all"
                ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
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
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <span aria-hidden>{f.emoji}</span> {f.short}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            Topics
          </span>
          {TAG_OPTIONS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => onTagToggle(tag)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
