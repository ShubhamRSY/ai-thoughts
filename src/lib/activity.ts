import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { waitUntil } from "@vercel/functions";
import { sendPushToHandle } from "@/lib/push";
import { reportError } from "@/lib/report-error";
import { canViewPosts, getPrivacy } from "@/lib/visibility";
import { isBlockedPair } from "@/lib/blocks";

export type ActivityKind = "reply" | "reaction" | "follow_post" | "mention";

export interface ActivityDoc {
  recipient_handle: string;
  actor_handle: string;
  actor_author: string;
  kind: ActivityKind;
  post_id: string;
  preview: string;
  read: boolean;
  created_at: Date;
  emailed?: boolean;
}

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

// Both handles are indexed (inbox lookup + "arrive exactly once" dedup), so
// they must be one canonical form (@-prefixed, lowercase) regardless of caller
// spelling — readers query by exact match, never by a casing scan.
function canonical(h: string) {
  return `@${normHandle(h)}`;
}
const recipientForm = canonical;
const actorForm = canonical;

async function writeActivity(
  db: Db,
  opts: {
    recipientHandle: string;
    actorHandle: string;
    actorAuthor: string;
    kind: ActivityKind;
    postId: string;
    preview: string;
    pushTitle: string;
    pushBody: string;
    pushTag: string;
    pushUrl?: string;
  }
): Promise<void> {
  if (normHandle(opts.recipientHandle) === normHandle(opts.actorHandle)) return;
  // Single sink for notifications and push: a blocked pair never reaches each other.
  if (await isBlockedPair(db, opts.recipientHandle, opts.actorHandle)) return;

  // One row per (recipient, actor, post, kind) — like→unlike→like refreshes
  // the same inbox row (bubbles it back to the top) instead of stacking three
  // near-identical notifications. The unique index below guarantees it even
  // under concurrent writes; the re-sent push (stable tag) replaces, not stacks.
  await db.collection("notifications").updateOne(
    {
      recipient_handle: recipientForm(opts.recipientHandle),
      actor_handle: actorForm(opts.actorHandle),
      post_id: opts.postId,
      kind: opts.kind,
    },
    {
      $set: {
        actor_author: opts.actorAuthor,
        preview: opts.preview.slice(0, 160),
        read: false,
        emailed: false,
        created_at: new Date(),
      },
      $setOnInsert: {
        recipient_handle: recipientForm(opts.recipientHandle),
        actor_handle: actorForm(opts.actorHandle),
        post_id: opts.postId,
        kind: opts.kind,
      },
    },
    { upsert: true }
  );

  // Off the request path: the actor shouldn't wait on the recipient's push services.
  waitUntil(
    sendPushToHandle(db, opts.recipientHandle, {
      title: opts.pushTitle,
      body: opts.pushBody,
      url: opts.pushUrl || `/app?post=${opts.postId}`,
      tag: opts.pushTag,
    }).catch((e) => reportError(e, { route: "lib/activity", service: "push" }))
  );
}

/** Notify a post’s author that someone engaged — never notify yourself. */
export async function notifyPostOwner(
  db: Db,
  opts: {
    postId: string;
    actorHandle: string;
    actorAuthor: string;
    kind: ActivityKind;
    preview: string;
  }
): Promise<void> {
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(opts.postId);
  } catch {
    return;
  }

  const post = await db.collection("posts").findOne(
    { _id: objectId },
    { projection: { handle: 1, content: 1, created_at: 1 } }
  );
  if (!post?.handle) return;
  if (normHandle(String(post.handle)) === normHandle(opts.actorHandle)) return;

  const createdAt =
    post.created_at instanceof Date
      ? post.created_at
      : post.created_at
        ? new Date(String(post.created_at))
        : null;
  const sameDay =
    createdAt &&
    !Number.isNaN(createdAt.getTime()) &&
    Date.now() - createdAt.getTime() < 24 * 60 * 60 * 1000;

  const isLike = opts.kind === "reaction" && opts.preview === "❤️";
  const title = sameDay
    ? opts.kind === "reply"
      ? `Same day · ${opts.actorAuthor} replied`
      : isLike
        ? `Same day · ${opts.actorAuthor} liked your take`
        : `Same day · ${opts.actorAuthor} reacted ${opts.preview}`
    : opts.kind === "reply"
      ? `${opts.actorAuthor} replied`
      : isLike
        ? `${opts.actorAuthor} liked your take`
        : `${opts.actorAuthor} reacted ${opts.preview}`;
  const body = sameDay
    ? opts.kind === "reply"
      ? opts.preview.slice(0, 120)
      : isLike
        ? `${opts.actorAuthor} liked today’s take. Open Voices while the thread is warm.`
        : "Someone felt today’s take. Open Voices while the thread is warm."
    : opts.kind === "reply"
      ? opts.preview.slice(0, 120)
      : isLike
        ? `${opts.actorAuthor} liked your take. Open Voices to see.`
        : "Someone felt your take. Open Voices to see.";

  await writeActivity(db, {
    recipientHandle: String(post.handle),
    actorHandle: opts.actorHandle,
    actorAuthor: opts.actorAuthor,
    kind: opts.kind,
    postId: opts.postId,
    preview: opts.preview,
    pushTitle: title,
    pushBody: body,
    pushTag: `post-${opts.postId}-${opts.kind}`,
    pushUrl: `/app?post=${opts.postId}`,
  });
}

/**
 * Notify people @mentioned in a comment — prefers people on the thread
 * (post author + commenters); also allows known user handles.
 */
export async function notifyMentions(
  db: Db,
  opts: {
    postId: string;
    actorHandle: string;
    actorAuthor: string;
    preview: string;
    mentioned: string[];
    /** Handles already notified (e.g. post owner via reply) — skip duplicates. */
    skipHandles?: string[];
  }
): Promise<void> {
  if (opts.mentioned.length === 0) return;

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(opts.postId);
  } catch {
    return;
  }

  const post = await db.collection("posts").findOne(
    { _id: objectId },
    { projection: { handle: 1, author: 1 } }
  );
  if (!post) return;

  const threadHandles = new Set<string>();
  threadHandles.add(normHandle(String(post.handle)));

  const prior = await db
    .collection<{ handle?: string }>("messages")
    .find({ post_id: opts.postId })
    .project({ handle: 1 })
    .limit(200)
    .toArray();
  for (const m of prior) {
    if (m.handle) threadHandles.add(normHandle(m.handle));
  }

  const skip = new Set((opts.skipHandles ?? []).map(normHandle));
  skip.add(normHandle(opts.actorHandle));
  const restricted = (await getPrivacy(db, String(post.handle))) !== "public";

  for (const raw of opts.mentioned) {
    const key = normHandle(raw);
    if (!key || skip.has(key)) continue;

    const onThread = threadHandles.has(key);
    let allowed = onThread;
    if (!allowed) {
      const user = await db.collection("users").findOne({
        handle: { $in: [key, `@${key}`] },
      });
      allowed = Boolean(user);
    }
    if (!allowed) continue;
    // A mention must not carry a private thread's comment to someone who
    // can't open that thread.
    if (restricted && !(await canViewPosts(db, `@${key}`, String(post.handle)))) continue;

    skip.add(key);
    await writeActivity(db, {
      recipientHandle: `@${key}`,
      actorHandle: opts.actorHandle,
      actorAuthor: opts.actorAuthor,
      kind: "mention",
      postId: opts.postId,
      preview: opts.preview,
      pushTitle: `${opts.actorAuthor} mentioned you`,
      pushBody: opts.preview.slice(0, 120),
      pushTag: `mention-${opts.postId}-${key}`,
    });
  }
}

/** Notify followers when someone they feel with shares a new take. */
export async function notifyFollowersOfPost(
  db: Db,
  opts: {
    postId: string;
    authorHandle: string;
    authorName: string;
    preview: string;
  }
): Promise<void> {
  const { listFollowers } = await import("@/lib/follows");
  const followers = await listFollowers(db, opts.authorHandle);
  for (const follower of followers) {
    if (normHandle(follower) === normHandle(opts.authorHandle)) continue;
    await writeActivity(db, {
      recipientHandle: follower,
      actorHandle: opts.authorHandle,
      actorAuthor: opts.authorName,
      kind: "follow_post",
      postId: opts.postId,
      preview: opts.preview,
      pushTitle: `${opts.authorName} shared a take`,
      pushBody: opts.preview.slice(0, 120),
      pushTag: `follow-${opts.postId}`,
    });
  }
}
