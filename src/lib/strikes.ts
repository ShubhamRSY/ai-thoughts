import { ObjectId, type Db } from "mongodb";
import { redactForStorage } from "./privacy.ts";
import { hasProfanity } from "./dignity.ts";

/** Reporter on automatic reports; "system" is a reserved handle, so no user can own it. */
export const AUTO_REPORTER = "@system";

/**
 * Strikes: every take, edit, reply or DM the filters block counts against the
 * account. Repeat it and posting pauses automatically, and keepers get a report
 * to decide on a ban. Bans stay human: the filters have false positives.
 */
export const STRIKES_TO_PAUSE = 3;
const DAY = 24 * 60 * 60_000;
/** Strike rows expire after this (TTL index strikes_ttl), so old slips are forgiven. */
export const STRIKE_MEMORY_MS = 30 * DAY;

export type StrikeWhere = "take" | "edit" | "reply" | "message";
export type Offender = { id: string; handle: string };

/**
 * How long posting pauses, given strikes in the last day and the last 30 days.
 * 0 = no pause. A second round within the month pauses for a week.
 */
export function pauseLengthMs(lastDay: number, lastMonth: number): number {
  if (lastDay < STRIKES_TO_PAUSE) return 0;
  return lastMonth >= STRIKES_TO_PAUSE * 2 ? 7 * DAY : DAY;
}

function untilLabel(until: Date): string {
  const hours = Math.ceil((until.getTime() - Date.now()) / 3_600_000);
  return hours > 48 ? `${Math.ceil(hours / 24)} days` : `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function pausedMessage(until: Date): string {
  return `Posting is paused for ${untilLabel(until)} after repeated posts that break the community guidelines.`;
}

/** The message to answer with when this account's posting is paused, else null. */
export async function postingPausedError(db: Db, userId: string): Promise<string | null> {
  if (!ObjectId.isValid(userId)) return null;
  const row = await db
    .collection("users")
    .findOne({ _id: new ObjectId(userId) }, { projection: { posting_paused_until: 1 } });
  const until = row?.posting_paused_until;
  return until instanceof Date && until.getTime() > Date.now() ? pausedMessage(until) : null;
}

/**
 * Count one blocked attempt. Returns text to append to the rejection: empty
 * normally, the pause notice when this strike tipped the account into a pause.
 * Only the redacted start of the text is kept, on the keeper report, so keepers
 * can judge it.
 */
export async function recordStrike(
  db: Db,
  who: Offender,
  where: StrikeWhere,
  text: string
): Promise<string> {
  const now = new Date();
  const strikes = db.collection("strikes");
  await strikes.insertOne({ user_id: who.id, where, created_at: now });
  const [lastDay, lastMonth] = await Promise.all([
    strikes.countDocuments({ user_id: who.id, created_at: { $gt: new Date(now.getTime() - DAY) } }),
    strikes.countDocuments({ user_id: who.id, created_at: { $gt: new Date(now.getTime() - STRIKE_MEMORY_MS) } }),
  ]);
  const pauseMs = pauseLengthMs(lastDay, lastMonth);
  if (!pauseMs || !ObjectId.isValid(who.id)) return "";

  const until = new Date(now.getTime() + pauseMs);
  await db
    .collection("users")
    .updateOne({ _id: new ObjectId(who.id) }, { $set: { posting_paused_until: until } });
  const handle = `@${who.handle.trim().toLowerCase().replace(/^@/, "")}`;
  // One open account report per offender: a repeat pause reopens and refreshes it.
  await db.collection("reports").updateOne(
    { post_id: handle, reporter_handle: AUTO_REPORTER },
    {
      $set: {
        target_type: "user",
        reason: `Automatic: ${lastDay} blocked posts in 24h — posting paused ${untilLabel(until)}`,
        reported_handle: handle,
        content_snippet: redactForStorage(text, 120),
        status: "open",
        created_at: now,
      },
      $unset: { resolved_at: "" },
    },
    { upsert: true }
  );
  return ` ${pausedMessage(until)}`;
}

/** Swearing posts allowed per day before the writer is asked to rephrase. */
export const SWEARS_PER_DAY = 3;

/**
 * Swearing posts freely at first — it's how some people say what they feel.
 * Past SWEARS_PER_DAY in 24h it's a habit, not a feeling: ask for a rephrase.
 * Never a strike. Returns the message to answer with, or null to let it post.
 */
export async function swearingLimitError(db: Db, userId: string, text: string): Promise<string | null> {
  if (!hasProfanity(text)) return null;
  const swears = db.collection("swears");
  const since = new Date(Date.now() - DAY);
  if ((await swears.countDocuments({ user_id: userId, created_at: { $gt: since } })) >= SWEARS_PER_DAY) {
    return "You’ve sworn a lot today — say this one without swearing. Strong feelings are still welcome.";
  }
  await swears.insertOne({ user_id: userId, created_at: new Date() });
  return null;
}
