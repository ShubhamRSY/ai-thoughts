"use client";

import { useCallback, useState } from "react";
import type { FeelingId } from "@/lib/types";

interface StreakData {
  last: string; // "YYYY-MM-DD" of the last take/check-in
  count: number;
  todayFeeling?: FeelingId | undefined;
}

const KEY = "pulse-streak";

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function read(): StreakData {
  if (typeof window === "undefined") return { last: "", count: 0 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StreakData;
  } catch {
    /* ignore */
  }
  return { last: "", count: 0 };
}

function ageOf(last: string): number {
  const today = dayKey(new Date());
  if (!last) return Infinity;
  return Math.round(
    (new Date(today + "T00:00:00").getTime() - new Date(last + "T00:00:00").getTime()) / 864e5
  );
}

/**
 * Daily "feels" streak — posting a take keeps your pulse streak alive.
 * localStorage-backed, so it works in demo mode with no backend.
 */
export function useFeelingStreak() {
  const [streak, setStreak] = useState<StreakData>(read);

  const bump = useCallback((feeling?: FeelingId) => {
    setStreak((prev) => {
      const today = dayKey(new Date());
      const age = ageOf(prev.last);
      const next: StreakData =
        age === 0
          ? { ...prev, last: today, todayFeeling: feeling ?? prev.todayFeeling }
          : { last: today, count: prev.last ? age === 1 ? prev.count + 1 : 1 : 1, todayFeeling: feeling };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { streak, bump };
}