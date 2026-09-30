import type { Db } from "mongodb";
import { addPair, norm, pairExists, relatedHandles, removePair, type PairSpec } from "./user-pairs.ts";

// Blocks are between accounts (user ids), so they survive either side
// renaming — see lib/user-pairs.ts. Callers pass and receive handles.
// follows/notifications keep mixed handle forms in the wild, so deletes
// against them use variants.
export const BLOCKS: PairSpec = { collection: "blocks", from: "blocker", to: "blocked" };

const variants = (h: string) => {
  const n = norm(h);
  return n ? Array.from(new Set([h, n, `@${n}`])) : [];
};

/** A block exists between the two handles, in either direction. */
export async function isBlockedPair(db: Db, a: string, b: string): Promise<boolean> {
  return pairExists(db, BLOCKS, a, b, true);
}

/** Everyone in a block relationship with `viewer`, either direction (all variants). */
export async function blockedHandles(db: Db, viewer: string | null): Promise<string[]> {
  return relatedHandles(db, BLOCKS, viewer, "both");
}

/** One direction only: the sole signal a client ever gets, and only the blocker. */
export async function blockedByMe(db: Db, viewer: string, other: string): Promise<boolean> {
  return pairExists(db, BLOCKS, viewer, other, false);
}

export async function blockUser(
  db: Db,
  blocker: string,
  target: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (norm(target) && norm(blocker) === norm(target)) {
    return { ok: false, error: "Can't block yourself", status: 400 };
  }
  const res = await addPair(db, BLOCKS, blocker, target);
  if (!res.ok) return res;

  // Cut every tie: follows (any status, so pending requests too) and any
  // notifications that already passed between the two.
  const va = variants(blocker);
  const vb = [...new Set([...variants(target), ...variants(res.toHandle)])];
  await db.collection("follows").deleteMany({
    $or: [
      { follower: { $in: va }, following: { $in: vb } },
      { follower: { $in: vb }, following: { $in: va } },
    ],
  });
  await db.collection("notifications").deleteMany({
    $or: [
      { recipient_handle: { $in: va }, actor_handle: { $in: vb } },
      { recipient_handle: { $in: vb }, actor_handle: { $in: va } },
    ],
  });
  return { ok: true };
}

/** Follows are deliberately not restored. */
export async function unblockUser(db: Db, blocker: string, target: string): Promise<void> {
  await removePair(db, BLOCKS, blocker, target);
}

/** Current handles this account has blocked, newest first. */
export async function listBlocked(db: Db, blocker: string): Promise<string[]> {
  const all = await relatedHandles(db, BLOCKS, blocker, "out", 500);
  return all.filter((h) => h.startsWith("@"));
}
