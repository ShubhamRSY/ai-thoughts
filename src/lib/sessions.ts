import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { describeDevice } from "./device.ts";

export interface SessionInfo {
  sid: string;
  label: string;
  deviceLabel: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

export async function listSessions(
  db: Db,
  userId: string,
  currentSid: string | undefined
): Promise<SessionInfo[]> {
  const rows = await db
    .collection("sessions")
    .find({ user_id: userId })
    .sort({ last_seen_at: -1 })
    .limit(50)
    .toArray();
  return rows.map((r) => ({
    sid: String(r.sid),
    label: r.device_label ?? describeDevice(r.user_agent),
    deviceLabel: r.device_label ?? describeDevice(r.user_agent),
    created_at: (r.created_at instanceof Date ? r.created_at : new Date()).toISOString(),
    last_seen_at: (r.last_seen_at instanceof Date ? r.last_seen_at : new Date()).toISOString(),
    current: r.sid === currentSid,
  }));
}

/**
 * Has this account ever signed in from this device before? Used to decide
 * whether a sign-in is worth alerting the owner about.
 *
 * Compares `device_label` ("Chrome on macOS") rather than the raw User-Agent,
 * because a browser version bump rewrites the UA and would otherwise mark a
 * familiar device as new on every Chrome update. Rows written before
 * device_label existed have no such field, so they fall back to a raw-UA
 * comparison — that keeps an existing account quiet through this change.
 *
 * Call this BEFORE createSession inserts the row for the sign-in being judged.
 */
export async function isNewDevice(
  db: Db,
  userId: string,
  userAgent: string | null | undefined
): Promise<boolean> {
  const label = describeDevice(userAgent);
  const ua = (userAgent ?? "").slice(0, 300);
  // An absent/blank UA can't be told apart from another absent one. Treat the
  // first as new and every later one as known, so a client that sends no UA
  // alerts once instead of on every sign-in.
  const seen = await db
    .collection("sessions")
    .countDocuments(
      {
        user_id: userId,
        $or: [{ device_label: label }, { device_label: { $exists: false }, user_agent: ua }],
      },
      { limit: 1 }
    );
  return seen === 0;
}

/** Ends one of the user's sessions. Scoped to `userId`, so it can't touch anyone else's. */
export async function revokeSession(db: Db, userId: string, sid: string): Promise<boolean> {
  const res = await db.collection("sessions").deleteOne({ sid, user_id: userId });
  return res.deletedCount > 0;
}

/**
 * Ends every session except `keepSid`. Also stamps the account so legacy
 * (sid-less) cookies on other devices stop working; the caller must re-issue the
 * current cookie afterwards, since it now predates the stamp.
 */
export async function revokeOthers(db: Db, userId: string, keepSid: string | undefined) {
  await db
    .collection("sessions")
    .deleteMany({ user_id: userId, ...(keepSid ? { sid: { $ne: keepSid } } : {}) });
  await stampRevocation(db, userId);
}

/** Ends every session, this one included. */
export async function revokeAll(db: Db, userId: string) {
  await db.collection("sessions").deleteMany({ user_id: userId });
  await stampRevocation(db, userId);
}

async function stampRevocation(db: Db, userId: string) {
  await db
    .collection("users")
    .updateOne({ _id: new ObjectId(userId) }, { $set: { sessions_revoked_before: Date.now() } });
}
