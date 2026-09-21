import type { Db } from "mongodb";
import { isBlockedPair } from "./blocks";
import { followStatusFor, getPrivacy, pendingActionFor, type Privacy } from "./visibility";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function withAt(h: string) {
  const n = normHandle(h);
  return n ? `@${n}` : "";
}

// Legacy rows have no status; only an explicit "pending" is not yet a follower.
const APPROVED = { status: { $ne: "pending" } } as const;

const variants = (h: string) => [withAt(h), h, normHandle(h)];

export async function followUser(
  db: Db,
  follower: string,
  following: string
): Promise<{ ok: boolean; error?: string; pending?: boolean }> {
  const a = withAt(follower);
  const b = withAt(following);
  if (!a || !b) return { ok: false, error: "Invalid handle" };
  if (normHandle(a) === normHandle(b)) return { ok: false, error: "Can't follow yourself" };

  // The target must actually be an account — a real user row, or a seeded
  // "Sample voice" that lives as a post with no users row. Without this,
  // anyone could follow arbitrary ghost handles and pollute the graph.
  const bVariants = [b, `@${normHandle(b)}`, b.toLowerCase(), normHandle(b)];
  const exists =
    (await db.collection("users").countDocuments({ handle: { $in: bVariants } }, { limit: 1 })) >
    0 ||
    (await db
      .collection("posts")
      .countDocuments({ handle: { $in: bVariants } }, { limit: 1 })) > 0;
  if (!exists) {
    return { ok: false, error: "That account doesn't exist" };
  }

  // Same message as a locked account, so a block isn't revealed to the blocked side.
  if (await isBlockedPair(db, a, b)) {
    return { ok: false, error: "This account isn't accepting followers" };
  }

  // Re-following is a no-op that reports the current state (never downgrades
  // an approved follower back to pending).
  const existing = await db.collection("follows").findOne({
    follower: { $in: variants(follower) },
    following: { $in: variants(following) },
  });
  if (existing) return { ok: true, pending: existing.status === "pending" };

  const status = followStatusFor(await getPrivacy(db, b));
  if (!status) return { ok: false, error: "This account isn't accepting followers" };

  await db.collection("follows").updateOne(
    { follower: a, following: b },
    {
      $set: { follower: a, following: b, updated_at: new Date() },
      $setOnInsert: { created_at: new Date(), status },
    },
    { upsert: true }
  );
  return { ok: true, pending: status === "pending" };
}

/** Also cancels a pending request (the row is simply removed). */
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
      ...APPROVED,
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
      ...APPROVED,
    })
    .limit(200)
    .toArray();
  return rows.map((r) => String(r.follower));
}

/** People who asked to follow `owner` and are awaiting approval. */
export async function listPendingRequests(db: Db, owner: string): Promise<string[]> {
  const rows = await db
    .collection("follows")
    .find({ following: { $in: variants(owner) }, status: "pending" })
    .limit(200)
    .toArray();
  return rows.map((r) => String(r.follower));
}

/** Accounts `follower` has asked to follow and is still waiting on. */
export async function listRequested(db: Db, follower: string): Promise<string[]> {
  const rows = await db
    .collection("follows")
    .find({ follower: { $in: variants(follower) }, status: "pending" })
    .limit(200)
    .toArray();
  return rows.map((r) => String(r.following));
}

/** Approve or decline one requester's pending request; returns rows affected. */
export async function resolveRequest(
  db: Db,
  owner: string,
  requester: string,
  action: "approve" | "decline"
): Promise<number> {
  const filter = {
    follower: { $in: variants(requester) },
    following: { $in: variants(owner) },
    status: "pending",
  };
  if (action === "decline") {
    return (await db.collection("follows").deleteMany(filter)).deletedCount;
  }
  return (
    await db
      .collection("follows")
      .updateMany(filter, { $set: { status: "approved", updated_at: new Date() } })
  ).modifiedCount;
}

/** Settle every pending request when `owner` switches privacy level. */
export async function applyPrivacyTransition(db: Db, owner: string, to: Privacy): Promise<void> {
  const action = pendingActionFor(to);
  if (action === "none") return;
  const filter = { following: { $in: variants(owner) }, status: "pending" };
  if (action === "decline") {
    await db.collection("follows").deleteMany(filter);
  } else {
    await db
      .collection("follows")
      .updateMany(filter, { $set: { status: "approved", updated_at: new Date() } });
  }
}

export async function getFollowState(
  db: Db,
  viewer: string,
  owner: string
): Promise<"none" | "requested" | "following"> {
  const row = await db.collection("follows").findOne({
    follower: { $in: variants(viewer) },
    following: { $in: variants(owner) },
  });
  if (!row) return "none";
  return row.status === "pending" ? "requested" : "following";
}

export async function resolveProfiles(db: Db, handles: string[]) {
  const unique = [...new Set(handles)];
  if (unique.length === 0) return [];
  const rows = await db
    .collection("profiles")
    .find({ handle: { $in: unique } })
    .toArray();
  const byHandle = new Map(rows.map((r) => [String(r.handle), r]));
  return unique.map((handle) => {
    const row = byHandle.get(handle);
    return {
      handle,
      author: row?.author ?? handle.replace(/^@/, ""),
      avatarUrl: row?.avatar_url ?? row?.avatarUrl ?? "",
    };
  });
}
