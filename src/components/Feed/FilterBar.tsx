"use client";

import type { FeelingId, MediaType } from "@/lib/types";

type MediaFilter = "all" | MediaType;
export type FeelingFilter = "all" | FeelingId;
export type RegionScope = "world" | "circle" | "today";

interface FilterBarProps {
  media: MediaFilter;
  onMediaChange: (m: MediaFilter) => void;
  feeling: FeelingFilter;
  onFeelingChange: (f: FeelingFilter) => void;
  regionScope: RegionScope;
  onRegionScopeChange: (s: RegionScope) => void;
  /** Active topic (e.g. "#Jobs"), null = all topics. */
  tag: string | null;
  onTagChange: (t: string | null) => void;
  circleCount?: number;
  todayCount?: number;
}

// Topic rooms: a second reason to open the app beyond the daily prompt.
const TOPICS = ["#Jobs", "#Tools", "#Ethics", "#Future"] as const;

const MEDIA_FILTERS: { id: MediaFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "audio", label: "Audio" },
  { id: "video", label: "Video" },
  { id: "text", label: "Text" },
];

export default function FilterBar({
  media,
  onMediaChange,
  regionScope,
  onRegionScopeChange,
  tag,
  onTagChange,
  circleCount = 0,
  todayCount = 0,
}: FilterBarProps) {
  return (
    <div className="app-pad mt-4 space-y-3 border-y border-[var(--border-base)] py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onRegionScopeChange("world")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            regionScope === "world"
              ? "bg-[var(--accent)] text-[var(--surface)]"
              : "border border-[var(--border-base)] text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          All voices
        </button>
        <button
          type="button"
          onClick={() => onRegionScopeChange("today")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            regionScope === "today"
              ? "bg-[var(--accent)] text-[var(--surface)]"
              : "border border-[var(--border-base)] text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Today&apos;s prompt{todayCount > 0 ? ` · ${todayCount}` : ""}
        </button>
        <button
          type="button"
          onClick={() => onRegionScopeChange("circle")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            regionScope === "circle"
              ? "bg-[var(--accent)] text-[var(--surface)]"
              : "border border-[var(--border-base)] text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Feel with{circleCount > 0 ? ` · ${circleCount}` : ""}
        </button>
      </div>

      {regionScope === "circle" && (
        <p className="text-[11px] text-[var(--muted)]">
          Takes from people you follow. Use ··· on a take → Follow.
        </p>
      )}

      {regionScope === "today" && (
        <p className="text-[11px] text-[var(--muted)]">
          Only answers to today&apos;s prompt — eavesdrop, then join.
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto" aria-label="Topics">
        {TOPICS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tag === t}
            onClick={() => onTagChange(tag === t ? null : t)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
              tag === t
                ? "bg-[var(--foreground)] text-[var(--surface)]"
                : "border border-[var(--border-base)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-5" role="tablist" aria-label="Format">
        {MEDIA_FILTERS.map((f) => {
          const active = media === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onMediaChange(f.id)}
              className={`relative shrink-0 py-1 text-sm transition ${
                active
                  ? "font-semibold text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {f.label}
              {active && (
                <span className="absolute inset-x-0 -bottom-2 h-[2px] bg-[var(--foreground)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
