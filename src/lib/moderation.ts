import { ObjectId, type Db } from "mongodb";
import { put } from "@vercel/blob";
import { isFlaggedContent, transcribeMedia } from "./content-moderation.ts";
import { privateBlobToken, signMediaUrl } from "./media-access.ts";
import { deleteBlobUrls, mediaUrlsFromPost } from "./privacy.ts";
import { filterDeletableMedia, forgetUploads } from "./uploads.ts";
import { CHILD_SAFETY } from "./report-reasons.ts";
import { reportError } from "./report-error.ts";

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
 * Every suspended account's handle, in all stored variants. A banned account
 * keeps its `users` row (so the same email can't re-register) and, because
 * banUser only removes takes, its `profiles` row too — so directory surfaces
 * that read `profiles` have to exclude it themselves, the same way they already
 * filter `users`. Without this a banned handle keeps showing up in people
 * search and stays followable.
 */
export async function suspendedHandles(db: Db): Promise<string[]> {
  const rows = await db
    .collection("users")
    .find({ suspended: true }, { projection: { handle: 1 } })
    .toArray();
  return rows.flatMap((r) => variants(String(r.handle ?? "")));
}

/**
 * Remove a post and everything that hangs off it: comments, notifications,
 * reactions, view rows and reports pointing at it. Quote-reposts that embed it
 * are softened server-side (the embedded copy becomes "removed") rather than
 * killing a whole cascade of conversation. Returns true when something was
 * deleted.
 */
export async function deletePostCascade(db: Db, postId: ObjectId, by = "system"): Promise<boolean> {
  const idStr = postId.toString();
  const keepFiles = await preserveChildSafetyEvidence(db, [idStr], by);
  const post = await db
    .collection<{ media_url?: string | null; stream_url?: string | null; user_id?: string }>("posts")
    .findOneAndDelete({ _id: postId }, { projection: { media_url: 1, stream_url: 1, user_id: 1 } });
  if (!post) return false;
  // Removed content must not stay reachable by its file link — but only the
  // author's own files go with it, never a file someone else uploaded (H3).
  const files = await filterDeletableMedia(
    db,
    mediaUrlsFromPost(post).filter((u) => !keepFiles.has(u)),
    String(post.user_id ?? ""),
    { postIds: [postId] }
  );
  await deleteBlobUrls(files);
  await forgetUploads(db, files);

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

  // Suspended accounts fail validateSession outright; stamping revocation
  // too ends any legacy (sid-less) cookie even if suspension is lifted later.
  await db.collection("users").updateOne(
    { _id: user._id },
    { $set: { suspended: true, suspended_at: new Date(), sessions_revoked_before: Date.now() } }
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
    await deletePostCascade(db, post._id, `ban:${h}`);
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
  const readableUrl = await signMediaUrl(mediaUrl);
  const transcript = readableUrl ? await transcribeMedia(readableUrl) : null;
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

/** Child-safety report: hide the take at once, same hold as automatic screening. */
export async function holdPost(db: Db, postId: ObjectId): Promise<void> {
  await db
    .collection("posts")
    .updateOne({ _id: postId }, { $set: { archived: true, archived_at: new Date(), moderation_hold: true } });
}

// US providers must preserve reported child sexual exploitation for 1 year
// (18 U.S.C. 2258A(h), as amended by the REPORT Act).
const EVIDENCE_KEEP_MS = 365 * 24 * 60 * 60_000;

/**
 * Runs before any take is deleted (keeper removal, ban, author delete,
 * account deletion). Takes reported for child safety are copied, with their
 * reports, into `evidence` (TTL: expires_at) and their file into the private
 * store under evidence/. Returns file URLs that could NOT be copied — callers
 * must leave those files in place.
 * ponytail: evidence/ files outlive their row's TTL; prune them by hand or add a cron.
 */
export async function preserveChildSafetyEvidence(db: Db, postIds: string[], by: string): Promise<Set<string>> {
  const keep = new Set<string>();
  if (postIds.length === 0) return keep;
  const reports = await db
    .collection("reports")
    .find({ post_id: { $in: postIds }, reason: CHILD_SAFETY })
    .toArray();
  if (reports.length === 0) return keep;

  const ids = [...new Set(reports.map((r) => String(r.post_id)))].filter((id) => ObjectId.isValid(id));
  const posts = await db
    .collection("posts")
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
    .toArray();
  for (const post of posts) {
    const idStr = post._id.toString();
    const mediaUrl = typeof post.media_url === "string" ? post.media_url : null;
    const fileCopy = mediaUrl ? await copyEvidenceFile(mediaUrl, idStr) : null;
    if (mediaUrl && !fileCopy) keep.add(mediaUrl);
    await db.collection("evidence").updateOne(
      { post_id: idStr },
      {
        $setOnInsert: {
          post_id: idStr,
          post,
          file_url: fileCopy,
          original_file_url: mediaUrl,
          reports: reports.filter((r) => String(r.post_id) === idStr),
          preserved_by: by,
          created_at: new Date(),
          expires_at: new Date(Date.now() + EVIDENCE_KEEP_MS),
        },
      },
      { upsert: true }
    );
  }
  return keep;
}

async function copyEvidenceFile(url: string, postId: string): Promise<string | null> {
  const token = privateBlobToken();
  const readable = await signMediaUrl(url);
  if (!token || !readable) return null;
  try {
    const res = await fetch(readable, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`evidence fetch ${res.status}`);
    const name = new URL(url).pathname.split("/").pop() || "file";
    const copy = await put(`evidence/${postId}/${name}`, Buffer.from(await res.arrayBuffer()), {
      access: "private",
      addRandomSuffix: true,
      contentType: res.headers.get("content-type") ?? undefined,
      token,
    });
    return copy.url;
  } catch (e) {
    reportError(e, { route: "lib/moderation", service: "blob" });
    return null;
  }
}
