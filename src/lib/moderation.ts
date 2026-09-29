import type { Db, ObjectId } from "mongodb";
import { isFlaggedContent, transcribeMedia } from "./content-moderation.ts";

// Suspended (banned) accounts keep their row so the same email can't
// immediately re-register, but they can't sign in and their content is removed.
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const at = (h: string) => `@${norm(h)}`;
const variants = (h: string) => Array.from(new Set([h, norm(h), at(h)]));

export async function isSuspended(db: Db, handle: string | null): Promise<boolean> {
  if (!handle) return false;
  const row = await db
    .collection("users")
    .findOne({ handle: { $in: variants(handle) } }, { projection: { suspended: 1 } });
  return row?.suspended === true;
}

/**
 * Remove a post and everything that hangs off it: comments, notifications,
 * reactions, view rows and reports pointing at it. Quote-reposts that embed it
 * are softened server-side (the embedded copy becomes "removed") rather than
 * killing a whole cascade of conversation. Returns true when something was
 * deleted.
 */
export async function deletePostCascade(
  db: Db,
  postId: import("mongodb").ObjectId
): Promise<boolean> {
  const idStr = postId.toString();
  const result = await db.collection("posts").deleteOne({ _id: postId });
  if (result.deletedCount === 0) return false;

  await Promise.all([
    db.collection("reactions").deleteMany({ post_id: idStr }),
    db.collection("post_views").deleteMany({ post_id: idStr }),
    db.collection("messages").deleteMany({ post_id: idStr }),
    db.collection("reports").deleteMany({ post_id: idStr }),
    db.collection("notifications").deleteMany({ post_id: idStr }),
  ]);
  // Quote-reposts keep the card but the embedded take resolves to "removed".
  await db
    .collection("posts")
    .updateMany(
      { quoted_post_id: idStr },
      { $set: { quoted_content: null, quoted_author: null, quoted_author_handle: null } }
    );
  return true;
}

/**
 * Ban a user: marks the account suspended (they can't sign in again), revokes
 * every session (they're logged out everywhere immediately) and removes their
 * takes from the public pulse. Follows and profile rows are left alone so an
 * appeals review has context; the feed filters suspended handles anyway.
 */
export async function banUser(db: Db, handle: string): Promise<boolean> {
  const h = at(handle);
  if (!norm(handle)) return false;
  const user = await db
    .collection("users")
    .findOne({ handle: { $in: [norm(handle), h] } }, { projection: { _id: 1, suspended: 1 } });
  if (!user) return false;

  await db.collection("users").updateOne(
    { _id: user._id },
    { $set: { suspended: true, suspended_at: new Date() } }
  );
  // Revoke sessions by user id — banned accounts are logged out everywhere.
  await db.collection("sessions").deleteMany({ user_id: user._id.toString() });
  await db.collection("push_subscriptions").deleteMany({ handle: { $in: [norm(handle), h] } });

  const posts = await db
    .collection("posts")
    .find({ handle: { $in: variants(handle) } }, { projection: { _id: 1 } })
    .limit(2000)
    .toArray();
  for (const post of posts) {
    await deletePostCascade(db, post._id);
  }
  return true;
}
/**
 * Runs after an audio/video take is published (transcription takes seconds,
 * too long to hold the post request). The transcript is saved either way — the
 * feed shows it as captions. Flagged speech hides the take and files a report:
 * a keeper's "dismiss" puts it back, "remove_post" deletes it. It is held, not
 * deleted, because a false positive must not destroy someone's recording.
 */
export async function screenMediaPost(db: Db, postId: ObjectId, mediaUrl: string): Promise<void> {
  const transcript = await transcribeMedia(mediaUrl);
  if (!transcript?.length) return;
  const posts = db.collection("posts");
  if (!(await isFlaggedContent({ text: transcript.map((s) => s.text).join(" ") }))) {
    await posts.updateOne({ _id: postId }, { $set: { transcript } });
    return;
  }
  const post = await posts.findOneAndUpdate(
    { _id: postId },
    { $set: { transcript, archived: true, archived_at: new Date(), moderation_hold: true } },
    { projection: { handle: 1, content: 1 } }
  );
  if (!post) return; // deleted meanwhile
  await db.collection("reports").updateOne(
    { post_id: postId.toString(), reporter_handle: AUTO_REPORTER },
    {
      $setOnInsert: {
        reason: "Automatic: speech in this take looks like it breaks the guidelines",
        reported_handle: post.handle ?? null,
        content_snippet: String(post.content ?? "").slice(0, 120),
        status: "open",
        created_at: new Date(),
      },
    },
    { upsert: true }
  );
}

/** Reporter on automatic reports; "system" is a reserved handle, so no user can own it. */
export const AUTO_REPORTER = "@system";

/** A keeper cleared a report: lift an automatic hold, if the take has one. */
export async function releaseModerationHold(db: Db, postId: ObjectId): Promise<void> {
  await db
    .collection("posts")
    .updateOne(
      { _id: postId, moderation_hold: true },
      { $unset: { moderation_hold: "", archived: "", archived_at: "" } }
    );
}
