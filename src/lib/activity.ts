import { ObjectId } from "mongodb";
import type { Db } from "mongodb";

export type ActivityKind = "reply" | "reaction";

export interface ActivityDoc {
  recipient_handle: string;
  actor_handle: string;
  actor_author: string;
  kind: ActivityKind;
  post_id: string;
  preview: string;
  read: boolean;
  created_at: Date;
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
    { projection: { handle: 1, content: 1 } }
  );
  if (!post?.handle) return;
  if (normHandle(String(post.handle)) === normHandle(opts.actorHandle)) return;

  await db.collection("notifications").insertOne({
    recipient_handle: String(post.handle),
    actor_handle: opts.actorHandle,
    actor_author: opts.actorAuthor,
    kind: opts.kind,
    post_id: opts.postId,
    preview: opts.preview.slice(0, 160),
    read: false,
    created_at: new Date(),
  } satisfies ActivityDoc);
}
