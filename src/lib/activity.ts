import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { sendPushToHandle } from "@/lib/push";

export type ActivityKind = "reply" | "reaction" | "follow_post";

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

  const recipient = String(post.handle);
  await db.collection("notifications").insertOne({
    recipient_handle: recipient,
    actor_handle: opts.actorHandle,
    actor_author: opts.actorAuthor,
    kind: opts.kind,
    post_id: opts.postId,
    preview: opts.preview.slice(0, 160),
    read: false,
    emailed: false,
    created_at: new Date(),
  } satisfies ActivityDoc);

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

  await sendPushToHandle(db, recipient, {
    title,
    body,
    url: "/app",
    tag: `post-${opts.postId}-${opts.kind}`,
  });
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
    await db.collection("notifications").insertOne({
      recipient_handle: follower.startsWith("@") ? follower : `@${normHandle(follower)}`,
      actor_handle: opts.authorHandle,
      actor_author: opts.authorName,
      kind: "follow_post",
      post_id: opts.postId,
      preview: opts.preview.slice(0, 160),
      read: false,
      emailed: false,
      created_at: new Date(),
    } satisfies ActivityDoc);

    await sendPushToHandle(db, follower, {
      title: `${opts.authorName} shared a take`,
      body: opts.preview.slice(0, 120),
      url: "/app",
      tag: `follow-${opts.postId}`,
    });
  }
}
