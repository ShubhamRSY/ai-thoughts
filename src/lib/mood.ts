import type { Db } from "mongodb";
// One row per person per day: a 5-second "how does AI feel today?" marker.
// (No "@/" imports here — this file is unit-tested with plain node.)

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 864e5;

/** Client-local day keys can differ from UTC by up to a day either way — nothing wider. */
export function isValidMoodDay(day: unknown, now = new Date()): day is string {
  if (typeof day !== "string" || !DAY_RE.test(day)) return false;
  const t = Date.parse(`${day}T00:00:00Z`);
  return !Number.isNaN(t) && Math.abs(t - now.getTime()) <= 2 * DAY_MS;
}

export function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** `source: "tap"` counts toward the community pulse; a mood from a post is already counted as that post. */
export async function setMood(
  db: Db,
  handle: string,
  day: string,
  feeling: string,
  source: "tap" | "post"
): Promise<void> {
  const handle_norm = handle.trim().toLowerCase().replace(/^@/, "");
  // ponytail: tap-then-post the same day counts that person twice in the community pulse; dedupe if it shows.
  await db.collection("moods").updateOne(
    { handle_norm, day },
    { $set: { feeling }, $setOnInsert: { source, created_at: new Date() } },
    { upsert: true }
  );
}

/** The 7 days ending at `endDay`, oldest first; days with no mood have feeling null. */
export async function weekMoods(db: Db, handle: string, endDay: string) {
  const handle_norm = handle.trim().toLowerCase().replace(/^@/, "");
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(endDay, i - 6));
  const rows = await db
    .collection<{ day: string; feeling: string }>("moods")
    .find({ handle_norm, day: { $in: days } })
    .toArray();
  const by = new Map(rows.map((r) => [r.day, r.feeling]));
  return days.map((day) => ({ day, feeling: by.get(day) ?? null }));
}
