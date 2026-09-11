import type { Db } from "mongodb";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function withAt(h: string) {
  const n = normHandle(h);
  return n ? `@${n}` : "";
}

export async function followUser(
  db: Db,
  follower: string,
  following: string
): Promise<{ ok: boolean; error?: string }> {
  const a = withAt(follower);
  const b = withAt(following);
  if (!a || !b) return { ok: false, error: "Invalid handle" };
  if (normHandle(a) === normHandle(b)) return { ok: false, error: "Can't follow yourself" };

  await db.collection("follows").updateOne(
    { follower: a, following: b },
    {
      $set: { follower: a, following: b, updated_at: new Date() },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true }
  );
  return { ok: true };
}

export async function unfollowUser(db: Db, follower: string, following: string): Promise<void> {
  const a = withAt(follower);
  const b = withAt(following);
  await db.collection("follows").deleteMany({
    follower: { $in: [a, follower, normHandle(follower)] },
    following: { $in: [b, following, normHandle(following)] },
  });
}

export async function listFollowing(db: Db, follower: string): Promise<string[]> {
  const a = withAt(follower);
  const rows = await db
    .collection("follows")
    .find({
      follower: { $in: [a, follower, normHandle(follower), `@${normHandle(follower)}`] },
    })
    .limit(200)
    .toArray();
  return rows.map((r) => String(r.following));
}

export async function isFollowing(
  db: Db,
  follower: string,
  following: string
): Promise<boolean> {
  const list = await listFollowing(db, follower);
  const target = normHandle(following);
  return list.some((h) => normHandle(h) === target);
}

export async function listFollowers(db: Db, following: string): Promise<string[]> {
  const b = withAt(following);
  const rows = await db
    .collection("follows")
    .find({
      following: { $in: [b, following, normHandle(following), `@${normHandle(following)}`] },
    })
    .limit(200)
    .toArray();
  return rows.map((r) => String(r.follower));
}
