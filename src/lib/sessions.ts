import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { describeDevice } from "./device.ts";

export interface SessionInfo {
  sid: string;
  label: string;
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
    label: describeDevice(r.user_agent),
    created_at: (r.created_at instanceof Date ? r.created_at : new Date()).toISOString(),
    last_seen_at: (r.last_seen_at instanceof Date ? r.last_seen_at : new Date()).toISOString(),
    current: r.sid === currentSid,
  }));
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
