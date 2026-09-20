import type { Db } from "mongodb";

// Block rows store handles as `@lowercase`. follows/notifications/users keep
// mixed forms in the wild, so deletes against them use variants.
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const at = (h: string) => `@${norm(h)}`;
const variants = (h: string) => {
  const n = norm(h);
  return n ? Array.from(new Set([h, n, `@${n}`])) : [];
};

/** A block exists between the two handles, in either direction. */
export async function isBlockedPair(db: Db, a: string, b: string): Promise<boolean> {
  const n = await db.collection("blocks").countDocuments(
    { $or: [{ blocker: at(a), blocked: at(b) }, { blocker: at(b), blocked: at(a) }] },
    { limit: 1 }
  );
  return n > 0;
}

/** Everyone in a block relationship with `viewer`, either direction (all variants). */
export async function blockedHandles(db: Db, viewer: string | null): Promise<string[]> {
  if (!viewer) return [];
  const me = at(viewer);
  const rows = await db
    .collection("blocks")
    .find({ $or: [{ blocker: me }, { blocked: me }] })
    .project({ blocker: 1, blocked: 1 })
    .toArray();
  const others = new Set(rows.map((r) => norm(String(r.blocker === me ? r.blocked : r.blocker))));
  return [...others].flatMap((h) => [h, `@${h}`]);
}

/** One direction only: the sole signal a client ever gets, and only the blocker. */
export async function blockedByMe(db: Db, viewer: string, other: string): Promise<boolean> {
  const n = await db
    .collection("blocks")
    .countDocuments({ blocker: at(viewer), blocked: at(other) }, { limit: 1 });
  return n > 0;
}

export async function blockUser(
  db: Db,
  blocker: string,
  target: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const a = at(blocker);
  const b = at(target);
  if (!norm(target)) return { ok: false, error: "Invalid handle", status: 400 };
  if (a === b) return { ok: false, error: "Can't block yourself", status: 400 };
  const exists = await db
    .collection("users")
    .findOne({ handle: { $in: [norm(target), b] } }, { projection: { _id: 1 } });
  if (!exists) return { ok: false, error: "Not found", status: 404 };

  await db
    .collection("blocks")
    .updateOne({ blocker: a, blocked: b }, { $setOnInsert: { created_at: new Date() } }, { upsert: true });

  // Cut every tie: follows (any status, so pending requests too) and any
  // notifications that already passed between the two.
  const va = variants(a);
  const vb = variants(b);
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
  await db.collection("blocks").deleteMany({ blocker: at(blocker), blocked: at(target) });
}

export async function listBlocked(db: Db, blocker: string): Promise<string[]> {
  const rows = await db
    .collection("blocks")
    .find({ blocker: at(blocker) })
    .sort({ created_at: -1 })
    .limit(500)
    .toArray();
  return rows.map((r) => String(r.blocked));
}
