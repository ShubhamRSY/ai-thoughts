import type { Db } from "mongodb";

// Mute rows store handles as `@lowercase`, one direction only: the muter never
// sees the muted's takes in their feed, but the muted user is not told and
// nothing is cut (unlike a block). Their profile stays viewable if public.
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const at = (h: string) => `@${norm(h)}`;

/** Everyone the viewer muted (returned as both `handle` and `@handle` variants). */
export async function mutedHandles(db: Db, viewer: string | null): Promise<string[]> {
  if (!viewer) return [];
  const rows = await db
    .collection("mutes")
    .find({ muter: at(viewer) })
    .project({ muted: 1 })
    .sort({ created_at: -1 })
    .limit(500)
    .toArray();
  return rows.flatMap((r) => {
    const n = norm(String(r.muted));
    return n ? [n, `@${n}`] : [];
  });
}

/** One direction only, and only the muter ever learns about it. */
export async function isMuted(db: Db, viewer: string, other: string): Promise<boolean> {
  const n = await db
    .collection("mutes")
    .countDocuments({ muter: at(viewer), muted: at(other) }, { limit: 1 });
  return n > 0;
}

export async function muteUser(
  db: Db,
  me: string,
  target: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const a = at(me);
  const b = at(target);
  if (!norm(target)) return { ok: false, error: "Invalid handle", status: 400 };
  if (a === b) return { ok: false, error: "Can't mute yourself", status: 400 };
  const exists = await db
    .collection("users")
    .findOne({ handle: { $in: [norm(target), b] } }, { projection: { _id: 1 } });
  if (!exists) return { ok: false, error: "Not found", status: 404 };

  await db
    .collection("mutes")
    .updateOne(
      { muter: a, muted: b },
      { $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    );
  return { ok: true };
}

export async function unmuteUser(db: Db, me: string, target: string): Promise<void> {
  await db.collection("mutes").deleteMany({ muter: at(me), muted: at(target) });
}

export async function listMuted(db: Db, me: string): Promise<string[]> {
  const rows = await db
    .collection("mutes")
    .find({ muter: at(me) })
    .sort({ created_at: -1 })
    .limit(500)
    .toArray();
  return rows.map((r) => String(r.muted));
}