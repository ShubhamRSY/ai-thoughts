import type { Db, ObjectId } from "mongodb";

// Who uploaded which file (SECURITY_AUDIT.md H3). Before this, any of our blob
// URLs could be attached to anyone's post or profile, and deleting that post
// deleted the file — someone else's take or photo.
//
// The client names uploads "<kind>-<uuid>.<ext>" and the upload route records
// { key: "u:<uuid>", owner_id } before handing out a token that is signed for
// exactly that pathname. The first claim wins, and a UUID is unguessable, so a
// file's row always names the person who uploaded it. Files from before this
// are keyed "p:<pathname>" by scripts/backfill-upload-owners.mjs.
// (No "@/" imports here — this file is unit-tested with plain node.)

export type UploadKind = "take" | "avatar";

export interface UploadRow {
  key: string;
  owner_id: string;
  kind: UploadKind;
  private: boolean;
  created_at: Date;
  /** Post id (takes, one post per file) or "profile:<userId>" (avatars); null until used. */
  attached_to: string | null;
  backfilled?: boolean;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXT = "(?:webm|mp4|m4a|mp3|ogg|wav|aac|mov|m4v|jpg|jpeg|png|webp|heic|heif)";
const REQUESTED = new RegExp(`^(take|avatar)-(${UUID})\\.${EXT}$`);
// Blob appends "-<random>" before the extension (addRandomSuffix).
const STORED = new RegExp(`^(take|avatar)-(${UUID})-[A-Za-z0-9]+\\.${EXT}$`);

/** The pathname a client asks to upload to, if it is one we issue tokens for. */
export function parseUploadPathname(pathname: string): { kind: UploadKind; uuid: string } | null {
  const m = REQUESTED.exec(pathname);
  return m ? { kind: m[1] as UploadKind, uuid: m[2] } : null;
}

function blobPathname(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)blob\.vercel-storage\.com$/i.test(u.hostname)) return null;
    return decodeURIComponent(u.pathname.slice(1));
  } catch {
    return null;
  }
}

/** Ownership key for a stored file URL: "u:<uuid>" for new uploads, "p:<pathname>" otherwise. */
export function uploadKeyForUrl(url: string): string | null {
  const pathname = blobPathname(url);
  if (!pathname) return null;
  const m = STORED.exec(pathname);
  return m ? `u:${m[2]}` : `p:${pathname}`;
}

/**
 * Which of `urls` may be deleted along with content owned by `subjectId`:
 * a recorded file only if it's theirs; an unrecorded (legacy) file only if
 * nothing else still references it.
 */
export function deletableUrls(
  urls: string[],
  subjectId: string,
  ownerByUrl: Map<string, string>,
  referencedElsewhere: Set<string>
): string[] {
  return [...new Set(urls)].filter((url) => {
    const owner = ownerByUrl.get(url);
    if (owner !== undefined) return owner === subjectId;
    return !referencedElsewhere.has(url);
  });
}

// ---- Size caps and quotas (SECURITY_AUDIT.md M4) ----------------------------

const MB = 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/aac", "audio/wav", "audio/x-wav", "audio/x-m4a"];
const VIDEO_TYPES = ["video/webm", "video/mp4", "video/ogg", "video/quicktime", "video/x-m4v"];

/**
 * What a token for `pathname` may upload. The extension picks the family;
 * webm/mp4/ogg can be audio or video, so they get the video cap. Avatars are
 * photos only. null = not an upload name we issue tokens for.
 */
export function uploadCaps(pathname: string): { maxBytes: number; contentTypes: string[] } | null {
  const parsed = parseUploadPathname(pathname);
  if (!parsed) return null;
  const ext = pathname.slice(pathname.lastIndexOf(".") + 1);
  const image = ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
  if (parsed.kind === "avatar") return image ? { maxBytes: 10 * MB, contentTypes: IMAGE_TYPES } : null;
  if (image) return { maxBytes: 10 * MB, contentTypes: IMAGE_TYPES };
  if (["m4a", "mp3", "wav", "aac"].includes(ext)) return { maxBytes: 25 * MB, contentTypes: AUDIO_TYPES };
  return { maxBytes: 150 * MB, contentTypes: [...AUDIO_TYPES, ...VIDEO_TYPES] };
}

/** Per-account upload quotas: [count, window] pairs per kind. */
export const UPLOAD_QUOTAS: Record<UploadKind, { max: number; windowMs: number }[]> = {
  take: [
    { max: 10, windowMs: 60 * 60_000 },
    { max: 30, windowMs: 24 * 60 * 60_000 },
  ],
  avatar: [{ max: 5, windowMs: 24 * 60 * 60_000 }],
};

/** Seconds until the next upload is allowed, given recent upload times; 0 = allowed now. */
export function quotaWaitSec(kind: UploadKind, recent: Date[], now = Date.now()): number {
  let wait = 0;
  for (const { max, windowMs } of UPLOAD_QUOTAS[kind]) {
    const inWindow = recent.map((d) => d.getTime()).filter((t) => now - t < windowMs).sort((a, b) => a - b);
    if (inWindow.length >= max) wait = Math.max(wait, Math.ceil((inWindow[inWindow.length - max] + windowMs - now) / 1000));
  }
  return wait;
}

/** Uploads older than this that never made it into a post or profile are removed. */
export const UNATTACHED_GRACE_MS = 24 * 60 * 60_000;

// ---- DB wrappers -----------------------------------------------------------

const uploads = (db: Db) => db.collection<UploadRow>("uploads");

/** Record the uploader before a token is issued. Throws if someone else holds the name. */
export async function claimUpload(db: Db, pathname: string, ownerId: string, isPrivate: boolean): Promise<UploadKind> {
  const parsed = parseUploadPathname(pathname);
  if (!parsed) throw new Error("Unsupported upload name");
  const key = `u:${parsed.uuid}`;
  try {
    await uploads(db).updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          owner_id: ownerId,
          kind: parsed.kind,
          private: isPrivate,
          created_at: new Date(),
          attached_to: null,
        },
      },
      { upsert: true }
    );
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e; // concurrent claim: re-read below
  }
  const row = await uploads(db).findOne({ key });
  if (!row || row.owner_id !== ownerId || row.kind !== parsed.kind) throw new Error("Upload name already in use");
  return parsed.kind;
}

/** Per-account quota check before a token is issued (counts recorded uploads, so it holds across instances). */
export async function uploadQuotaWaitSec(db: Db, ownerId: string, kind: UploadKind): Promise<number> {
  const longest = Math.max(...UPLOAD_QUOTAS[kind].map((q) => q.windowMs));
  const recent = await uploads(db)
    .find({ owner_id: ownerId, kind, created_at: { $gt: new Date(Date.now() - longest) } })
    .project<{ created_at: Date }>({ created_at: 1 })
    .toArray();
  return quotaWaitSec(kind, recent.map((r) => r.created_at));
}

export type AttachCheck = { ok: true; key: string } | { ok: false; status: 400 | 403 | 409; error: string };

/** Whether `userId` may attach `url` as `kind`. Read-only; see claimAttachment. */
export async function checkAttach(db: Db, url: string, userId: string, kind: UploadKind): Promise<AttachCheck> {
  const key = uploadKeyForUrl(url);
  const row = key ? await uploads(db).findOne({ key }) : null;
  if (!key || !row || row.owner_id !== userId) {
    return { ok: false, status: 403, error: "You can only attach media you uploaded here" };
  }
  if (row.kind !== kind) return { ok: false, status: 400, error: "That file can't be used here" };
  if (kind === "take" && row.attached_to) {
    return { ok: false, status: 409, error: "That file is already part of another take" };
  }
  return { ok: true, key };
}

/** Atomically bind a take's file to one post. False if it was bound meanwhile. */
export async function claimAttachment(db: Db, key: string, userId: string, postId: ObjectId): Promise<boolean> {
  const res = await uploads(db).updateOne(
    { key, owner_id: userId, attached_to: null },
    { $set: { attached_to: postId.toString() } }
  );
  return res.modifiedCount === 1;
}

export async function releaseAttachment(db: Db, key: string, postId: ObjectId): Promise<void> {
  await uploads(db).updateOne({ key, attached_to: postId.toString() }, { $set: { attached_to: null } });
}

export async function markAvatar(db: Db, key: string, userId: string): Promise<void> {
  await uploads(db).updateOne({ key, owner_id: userId }, { $set: { attached_to: `profile:${userId}` } });
}

/**
 * Filter media URLs down to the ones safe to delete with `subjectId`'s
 * content. `leaving` excludes the posts/profiles being deleted right now from
 * the "referenced elsewhere" check.
 */
export async function filterDeletableMedia(
  db: Db,
  urls: string[],
  subjectId: string,
  leaving: { postIds?: ObjectId[]; profileIds?: ObjectId[] } = {}
): Promise<string[]> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (!unique.length) return [];
  const keyOf = new Map(unique.map((u) => [u, uploadKeyForUrl(u)] as const));
  const keys = [...new Set([...keyOf.values()].filter((k): k is string => Boolean(k)))];
  const rows = keys.length ? await uploads(db).find({ key: { $in: keys } }).project<{ key: string; owner_id: string }>({ key: 1, owner_id: 1 }).toArray() : [];
  const ownerByKey = new Map(rows.map((r) => [r.key, r.owner_id]));
  const ownerByUrl = new Map<string, string>();
  for (const [u, k] of keyOf) if (k && ownerByKey.has(k)) ownerByUrl.set(u, ownerByKey.get(k)!);

  const unrecorded = unique.filter((u) => !ownerByUrl.has(u));
  const referencedElsewhere = new Set<string>();
  if (unrecorded.length) {
    const [posts, profiles] = await Promise.all([
      db
        .collection("posts")
        .find({
          _id: { $nin: leaving.postIds ?? [] },
          $or: [{ media_url: { $in: unrecorded } }, { stream_url: { $in: unrecorded } }],
        })
        .project({ media_url: 1, stream_url: 1 })
        .toArray(),
      db
        .collection("profiles")
        .find({
          _id: { $nin: leaving.profileIds ?? [] },
          $or: [{ avatar_url: { $in: unrecorded } }, { avatarUrl: { $in: unrecorded } }],
        })
        .project({ avatar_url: 1, avatarUrl: 1 })
        .toArray(),
    ]);
    for (const d of [...posts, ...profiles]) {
      for (const f of ["media_url", "stream_url", "avatar_url", "avatarUrl"]) {
        if (typeof d[f] === "string") referencedElsewhere.add(d[f]);
      }
    }
  }
  return deletableUrls(unique, subjectId, ownerByUrl, referencedElsewhere);
}

/** After deleting files, drop their ownership rows too. */
export async function forgetUploads(db: Db, urls: string[]): Promise<void> {
  const keys = urls.map(uploadKeyForUrl).filter((k): k is string => Boolean(k));
  if (keys.length) await uploads(db).deleteMany({ key: { $in: keys } });
}
