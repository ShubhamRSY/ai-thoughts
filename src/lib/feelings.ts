import type { Feeling, FeelingId } from "@/lib/types";

export const FEELINGS: Feeling[] = [
  {
    id: "using-it",
    emoji: "🤖",
    label: "I use it every day",
    short: "Daily using",
    chip: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  {
    id: "love-it",
    emoji: "💜",
    label: "I genuinely love it",
    short: "Loves it",
    chip: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  },
  {
    id: "blown-away",
    emoji: "🤯",
    label: "It blows my mind",
    short: "Blown away",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    id: "hurts",
    emoji: "😔",
    label: "It makes me feel bad",
    short: "Feeling bad",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  {
    id: "worried",
    emoji: "😰",
    label: "I worry about people",
    short: "Worried",
    chip: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  },
  {
    id: "confused",
    emoji: "😶‍🌫️",
    label: "I don't understand it",
    short: "Confused",
    chip: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  },
  {
    id: "need-support",
    emoji: "🤝",
    label: "I need support with it",
    short: "Needs support",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
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