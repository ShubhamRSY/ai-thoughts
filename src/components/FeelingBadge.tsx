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

  const pad =
    size === "sm" ? "text-[11px]" : size === "lg" ? "text-sm" : "text-xs";

  return (
    <span
      className={`inline font-medium text-[var(--accent)] ${pad}`}
      title={f.label}
    >
      {f.short}
    </span>
  );
}
