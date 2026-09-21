import { test } from "node:test";
import assert from "node:assert/strict";
import {
  promptDayKey,
  promptDayKeyUTC,
  shiftDayKey,
  yesterdayKey,
  todayKey,
  dailyPrompt,
  dailyPromptUTC,
  dailyPromptForDay,
  weeklyTheme,
  PROMPTS,
  THEMES,
} from "./daily-prompt.ts";

const DAY = 864e5;

test("promptDayKey pads month and day", () => {
  assert.equal(promptDayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(promptDayKey(new Date(2026, 11, 31)), "2026-12-31");
});

test("promptDayKeyUTC uses UTC fields", () => {
  // Local-ish instant picked to avoid DST: noon UTC.
  const d = new Date(Date.UTC(2026, 2, 7, 12, 0, 0));
  assert.equal(promptDayKeyUTC(d), "2026-03-07");
});

test("shiftDayKey crosses month and year boundaries", () => {
  assert.equal(shiftDayKey("2026-01-31", 1), "2026-02-01");
  assert.equal(shiftDayKey("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDayKey("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDayKey("2026-01-01", -1), "2025-12-31");
  // Leap year: 2028 is a leap year.
  assert.equal(shiftDayKey("2028-03-01", -1), "2028-02-29");
});

test("yesterdayKey is the day before any date", () => {
  assert.equal(yesterdayKey(new Date(2026, 5, 15)), "2026-06-14");
  assert.equal(yesterdayKey(new Date(2026, 0, 1)), "2025-12-31");
  assert.equal(yesterdayKey(new Date(2026, 2, 1)), "2026-02-28");
});

test("todayKey matches promptDayKey", () => {
  const now = new Date();
  assert.equal(todayKey(), promptDayKey(now));
});

test("dailyPrompt is deterministic for a date and same local calendar day", () => {
  const d1 = dailyPrompt(new Date(2026, 8, 21, 0, 0, 0));
  const d2 = dailyPrompt(new Date(2026, 8, 21, 23, 59, 59));
  assert.equal(d1, d2);
  assert.ok(PROMPTS.includes(d1));
});

test("dailyPrompt spans the full catalog before repeating", () => {
  const seen = new Set<string>();
  const start = new Date(2026, 0, 1);
  for (let i = 0; i < PROMPTS.length; i++) {
    seen.add(dailyPrompt(new Date(start.getTime() + i * DAY)));
  }
  assert.equal(seen.size, PROMPTS.length);
});

test("dailyPromptUTC and dailyPromptForDay agree", () => {
  const day = new Date(Date.UTC(2026, 8, 21));
  const key = promptDayKeyUTC(day);
  assert.equal(dailyPromptForDay(key), dailyPromptUTC(day));
});

test("dailyPromptForDay is stable across the same calendar day everywhere", () => {
  // Same YYYY-MM-DD must always map to the same prompt string.
  assert.equal(
    dailyPromptForDay("2026-09-21"),
    dailyPromptForDay("2026-09-21")
  );
});

test("weeklyTheme rotates weekly", () => {
  const w1 = weeklyTheme(new Date(2026, 0, 1));
  const w2 = weeklyTheme(new Date(2026, 0, 8));
  assert.ok(THEMES.includes(w1));
  assert.ok(THEMES.includes(w2));
  assert.equal(weeklyTheme(new Date(2026, 0, 1)), weeklyTheme(new Date(2026, 0, 2)));
});