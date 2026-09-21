import test from "node:test";
import assert from "node:assert/strict";
import { isValidMoodDay, shiftDay } from "./mood.ts";

const now = new Date("2026-09-21T12:00:00Z");

test("isValidMoodDay accepts today and ±1 day, rejects junk and far dates", () => {
  assert.ok(isValidMoodDay("2026-09-21", now));
  assert.ok(isValidMoodDay("2026-09-20", now));
  assert.ok(isValidMoodDay("2026-09-22", now));
  assert.ok(!isValidMoodDay("2026-09-01", now));
  assert.ok(!isValidMoodDay("2026-9-21", now));
  assert.ok(!isValidMoodDay("2026-13-45", now));
  assert.ok(!isValidMoodDay(20260921, now));
});

test("shiftDay crosses month boundaries", () => {
  assert.equal(shiftDay("2026-10-01", -1), "2026-09-30");
  assert.equal(shiftDay("2026-09-30", 1), "2026-10-01");
});
