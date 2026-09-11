import type { Feeling, FeelingId } from "@/lib/types";

/** Soft chips tuned for the light “Quiet Pulse” theme. */
export const FEELINGS: Feeling[] = [
  {
    id: "using-it",
    emoji: "◎",
    label: "I use it every day",
    short: "Daily",
    chip: "bg-sky-100 text-sky-800 border-sky-200",
  },
  {
    id: "love-it",
    emoji: "♥",
    label: "I genuinely love it",
    short: "Love it",
    chip: "bg-teal-100 text-teal-800 border-teal-200",
  },
  {
    id: "blown-away",
    emoji: "✦",
    label: "It blows my mind",
    short: "Amazed",
    chip: "bg-amber-100 text-amber-900 border-amber-200",
  },
  {
    id: "hurts",
    emoji: "◦",
    label: "It makes me feel bad",
    short: "Hurts",
    chip: "bg-rose-100 text-rose-800 border-rose-200",
  },
  {
    id: "worried",
    emoji: "∿",
    label: "I worry about people",
    short: "Worried",
    chip: "bg-orange-100 text-orange-900 border-orange-200",
  },
  {
    id: "confused",
    emoji: "?",
    label: "I don't understand it",
    short: "Confused",
    chip: "bg-slate-100 text-slate-700 border-slate-200",
  },
  {
    id: "need-support",
    emoji: "+",
    label: "I need support with it",
    short: "Need help",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
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
