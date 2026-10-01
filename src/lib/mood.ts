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
/** One row per person per day storing a SET of feelings — you can pick several, or "All" (= everything). */
export async function setMood(
  db: Db,
  handle: string,
  day: string,
  feelings: string[],
  source: "tap" | "post"
): Promise<void> {
  const handle_norm = handle.trim().toLowerCase().replace(/^@/, "");
  // One row per person per day, so a post-then-tap (or tap-then-post) day is
  // still counted exactly once: `source` tracks the *latest* action, which is
  // what the community pulse reads. With $setOnInsert it was frozen at the
  // first write of the day, so anyone who posted a take and then tapped was
  // recorded as a post and never counted toward the pulse at all.
  await db.collection("moods").updateOne(
    { handle_norm, day },
    { $set: { feeling: feelings, source }, $setOnInsert: { created_at: new Date() } },
    { upsert: true }
  );
}

/** The 7 days ending at `endDay`, oldest first; days with no mood have feeling null. */
export async function weekMoods(db: Db, handle: string, endDay: string) {
  const handle_norm = handle.trim().toLowerCase().replace(/^@/, "");
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(endDay, i - 6));
  const rows = await db
    .collection<{ day: string; feeling: string[] | null }>("moods")
    .find({ handle_norm, day: { $in: days } })
    .toArray();
  const by = new Map(rows.map((r) => [r.day, r.feeling ?? null]));
  return days.map((day) => ({ day, feeling: by.get(day) ?? null }));
}
