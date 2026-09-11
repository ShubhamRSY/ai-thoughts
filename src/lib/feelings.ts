import type { Feeling, FeelingId } from "@/lib/types";

/** Monochrome-friendly chips — no rainbow dashboard. */
export const FEELINGS: Feeling[] = [
  {
    id: "using-it",
    emoji: "",
    label: "I use it every day",
    short: "Daily",
    chip: "bg-[var(--surface-2)] text-[var(--foreground)] border-[var(--border-base)]",
  },
  {
    id: "love-it",
    emoji: "",
    label: "I genuinely love it",
    short: "Love it",
    chip: "bg-[var(--accent-soft)] text-[var(--accent-2)] border-transparent",
  },
  {
    id: "blown-away",
    emoji: "",
    label: "It blows my mind",
    short: "Amazed",
    chip: "bg-[var(--surface-2)] text-[var(--foreground)] border-[var(--border-base)]",
  },
  {
    id: "hurts",
    emoji: "",
    label: "It makes me feel bad",
    short: "Hurts",
    chip: "bg-[var(--surface-2)] text-[var(--foreground)] border-[var(--border-base)]",
  },
  {
    id: "worried",
    emoji: "",
    label: "I worry about people",
    short: "Worried",
    chip: "bg-[var(--surface-2)] text-[var(--foreground)] border-[var(--border-base)]",
  },
  {
    id: "confused",
    emoji: "",
    label: "I don't understand it",
    short: "Confused",
    chip: "bg-[var(--surface-2)] text-[var(--foreground)] border-[var(--border-base)]",
  },
  {
    id: "need-support",
    emoji: "",
    label: "I need support with it",
    short: "Need help",
    chip: "bg-[var(--surface-2)] text-[var(--foreground)] border-[var(--border-base)]",
  },
];

export const FEELING_MAP: Record<FeelingId, Feeling> = FEELINGS.reduce(
  (m, f) => {
    m[f.id] = f;
    return m;
  },
  {} as Record<FeelingId, Feeling>
);

export function feelingOf(id?: FeelingId): Feeling | undefined {
  return id ? FEELING_MAP[id] : undefined;
}
