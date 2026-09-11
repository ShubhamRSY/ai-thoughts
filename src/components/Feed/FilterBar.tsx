"use client";

import type { FeelingId, MediaType } from "@/lib/types";
import type { ContinentId } from "@/lib/region";
import { CONTINENTS, continentLabel } from "@/lib/region";

type MediaFilter = "all" | MediaType;
export type FeelingFilter = "all" | FeelingId;
export type RegionScope = "near" | "world" | "circle";

interface FilterBarProps {
  media: MediaFilter;
  onMediaChange: (m: MediaFilter) => void;
  feeling: FeelingFilter;
  onFeelingChange: (f: FeelingFilter) => void;
  regionScope: RegionScope;
  onRegionScopeChange: (s: RegionScope) => void;
  continent: ContinentId;
  onContinentChange: (c: ContinentId) => void;
  circleCount?: number;
}

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
  continent,
  onContinentChange,
  circleCount = 0,
}: FilterBarProps) {
  return (
    <div className="app-pad mt-4 space-y-3 border-y border-[var(--border-base)] py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onRegionScopeChange("near")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            regionScope === "near"
              ? "bg-[var(--accent)] text-[var(--surface)]"
              : "border border-[var(--border-base)] text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Near you · {continentLabel(continent)}
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
        <button
          type="button"
          onClick={() => onRegionScopeChange("world")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            regionScope === "world"
              ? "bg-[var(--accent)] text-[var(--surface)]"
              : "border border-[var(--border-base)] text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Worldwide
        </button>
      </div>

      {regionScope === "near" && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {CONTINENTS.map((c) => {
            const active = continent === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onContinentChange(c.id)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent-2)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {regionScope === "circle" && (
        <p className="text-[11px] text-[var(--muted)]">
          Takes from people you feel with. Tap Feel with on any voice to add them.
        </p>
      )}

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
