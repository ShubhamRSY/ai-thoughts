"use client";

import { feelingOf } from "@/lib/feelings";
import type { Feeling } from "@/lib/types";

export default function FeelingBadge({
  feeling,
  size = "md",
}: {
  feeling?: Feeling["id"];
  size?: "sm" | "md" | "lg";
}) {
  if (!feeling) return null;
  const f = feelingOf(feeling);
  if (!f) return null;

  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs";
  const emoji = size === "lg" ? "text-lg" : size === "sm" ? "text-[12px]" : "text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${f.chip} ${pad}`}
      title={`Feeling: ${f.label}`}
    >
      <span className={`leading-none ${emoji}`} aria-hidden>
        {f.emoji}
      </span>
      {size !== "sm" && f.short}
    </span>
  );
}