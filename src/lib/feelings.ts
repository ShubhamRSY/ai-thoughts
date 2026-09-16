import type { Feeling, FeelingId } from "@/lib/types";

/**
 * Feelings stay emotionally clear in language — chips stay simple
 * (accent / surface only, no rainbow).
 */
const CHIP_SOFT =
  "border-[var(--border-base)] bg-[var(--surface-2)] text-[var(--foreground)]";

export const FEELINGS: Feeling[] = [
  {
    id: "using-it",
    emoji: "",
    label: "I use it every day",
    short: "Daily",
    chip: CHIP_SOFT,
    tone: "steady",
  },
  {
    id: "love-it",
    emoji: "",
    label: "I genuinely love it",
    short: "Love it",
    chip: CHIP_SOFT,
    tone: "warm",
  },
  {
    id: "blown-away",
    emoji: "",
    label: "It blows my mind",
    short: "Amazed",
    chip: CHIP_SOFT,
    tone: "bright",
  },
  {
    id: "hurts",
    emoji: "",
    label: "It makes me feel bad",
    short: "Hurts",
    chip: CHIP_SOFT,
    tone: "tender",
  },
  {
    id: "worried",
    emoji: "",
    label: "I worry about people",
    short: "Worried",
    chip: CHIP_SOFT,
    tone: "uneasy",
  },
  {
    id: "confused",
    emoji: "",
    label: "I don’t understand it",
    short: "Confused",
    chip: CHIP_SOFT,
    tone: "lost",
  },
  {
    id: "need-support",
    emoji: "",
    label: "I need support with it",
    short: "Need help",
    chip: CHIP_SOFT,
    tone: "reaching",
  },
];

export const FEELING_MAP: Record<FeelingId, Feeling> = FEELINGS.reduce(
  (m, f) => {
    m[f.id] = f;
    return m;
  },
  {} as Record<FeelingId, Feeling>
);

export function feelingOf(id?: FeelingId | string | null): Feeling | undefined {
  if (!id) return undefined;
  return FEELING_MAP[id as FeelingId];
}

export type FeelingTally = {
  id: FeelingId;
  count: number;
};

/** Subtle shared wash — one quiet accent, not a mood rainbow. */
export function feelingWash(_id?: FeelingId | string | null): string {
  if (!_id) return "";
  return "bg-gradient-to-br from-[var(--accent-soft)]/35 to-transparent";
}
