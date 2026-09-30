import type { Db } from "mongodb";
import { addPair, norm, pairExists, relatedHandles, removePair, type PairSpec } from "./user-pairs.ts";

// Mutes are one direction only: the muter never sees the muted's takes in
// their feed, but the muted user is not told and nothing is cut (unlike a
// block). Their profile stays viewable if public. Stored between accounts
// (user ids) so a rename on either side doesn't lift it — see lib/user-pairs.ts.
export const MUTES: PairSpec = { collection: "mutes", from: "muter", to: "muted" };

/** Everyone the viewer muted (returned as both `handle` and `@handle` variants). */
export async function mutedHandles(db: Db, viewer: string | null): Promise<string[]> {
  return relatedHandles(db, MUTES, viewer, "out", 500);
}

/** One direction only, and only the muter ever learns about it. */
export async function isMuted(db: Db, viewer: string, other: string): Promise<boolean> {
  return pairExists(db, MUTES, viewer, other, false);
}

export async function muteUser(
  db: Db,
  me: string,
  target: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (norm(target) && norm(me) === norm(target)) {
    return { ok: false, error: "Can't mute yourself", status: 400 };
  }
  const res = await addPair(db, MUTES, me, target);
  return res.ok ? { ok: true } : res;
}

export async function unmuteUser(db: Db, me: string, target: string): Promise<void> {
  await removePair(db, MUTES, me, target);
}

/** Current handles this account has muted, newest first. */
export async function listMuted(db: Db, me: string): Promise<string[]> {
  return (await relatedHandles(db, MUTES, me, "out", 500)).filter((h) => h.startsWith("@"));
}
