"use client";

import { feelingOf } from "@/lib/feelings";
import type { Feeling, FeelingId } from "@/lib/types";

export default function FeelingBadge({
  feeling,
  size = "md",
  showLabel = false,
  onClick,
  customLabel,
}: {
  feeling?: Feeling["id"] | FeelingId;
  size?: "sm" | "md" | "lg";
  /** Show the full human sentence (“I worry about people”). */
  showLabel?: boolean;
  onClick?: () => void;
  /** Free-typed text to show instead of the preset label (feeling "custom"). */
  customLabel?: string;
}) {
  if (!feeling) return null;
  const f = feelingOf(feeling);
  if (!f) return null;
  const text = customLabel?.trim() || (showLabel ? f.label : f.short);

  const pad =
    size === "sm"
      ? "text-[12px]"
      : size === "lg"
        ? "px-3.5 py-1.5 text-sm"
        : "px-2.5 py-1 text-xs";

  const className =
    size === "sm"
      ? `inline-flex max-w-full items-center gap-1 text-[13px] text-[var(--foreground)]/70 transition ${
          onClick ? "cursor-pointer hover:text-[var(--foreground)]" : ""
        }`
      : `inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium transition ${f.chip} ${pad} ${
          onClick ? "cursor-pointer hover:opacity-90" : ""
        }`;
  const label = <span className="truncate">{text}</span>;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={text} className={className}>
        {label}
      </button>
    );
  }

  return (
    <span title={text} className={className}>
      {label}
    </span>
  );
}
