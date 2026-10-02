import type { Db } from "mongodb";
import { del, list } from "@vercel/blob";
import { privateBlobToken } from "./media-access.ts";
import { deleteBlobUrls } from "./privacy.ts";
import { reportError } from "./report-error.ts";
import { forgetUploads, UNATTACHED_GRACE_MS, type UploadRow } from "./uploads.ts";

// Removes uploads that never made it into a post or profile within the grace
// period (SECURITY_AUDIT.md M4) — abandoned drafts, and anything uploaded just
// to use storage. Only rows recorded by /api/upload qualify; files from
// before ownership was recorded are out of scope here.
//
// Dry run unless UPLOAD_CLEANUP_APPLY=1: it reports what it would remove.

const BATCH = 200;

export function staleUploadFilter(now = Date.now()) {
  return {
    key: { $regex: /^u:/ },
    attached_to: null,
    backfilled: { $ne: true },
    created_at: { $lt: new Date(now - UNATTACHED_GRACE_MS) },
  };
}

export interface CleanupResult {
  dryRun: boolean;
  candidates: number;
  removedFiles: number;
  removedRecords: number;
  sample: { key: string; kind: string; created_at: string }[];
}

export async function cleanupUnattachedUploads(db: Db, opts: { apply: boolean }): Promise<CleanupResult> {
  const uploads = db.collection<UploadRow>("uploads");
  const rows = await uploads.find(staleUploadFilter()).sort({ created_at: 1 }).limit(BATCH).toArray();
  const result: CleanupResult = {
    dryRun: !opts.apply,
    candidates: rows.length,
    removedFiles: 0,
    removedRecords: 0,
    sample: rows.slice(0, 20).map((r) => ({ key: r.key, kind: r.kind, created_at: r.created_at.toISOString() })),
  };
  if (!opts.apply) return result;

  for (const row of rows) {
    // Claim it first: an attach racing with this sees it's no longer free.
    const claimed = await uploads.findOneAndUpdate(
      { _id: row._id, attached_to: null },
      { $set: { attached_to: "cleanup" } }
    );
    if (!claimed) continue;
    const token = (row.private ? privateBlobToken() : process.env.BLOB_READ_WRITE_TOKEN) || undefined;
    try {
      const { blobs } = await list({ prefix: `${row.kind}-${row.key.slice(2)}`, token });
      if (blobs.length) await del(blobs.map((b) => b.url), { token });
      result.removedFiles += blobs.length;
      await uploads.deleteOne({ _id: row._id });
      result.removedRecords += 1;
    } catch {
      // Leave it for the next run.
      await uploads.updateOne({ _id: row._id, attached_to: "cleanup" }, { $set: { attached_to: null } });
    }
  }
  return result;
}

// Files whose delete failed when their post/account was removed. The ownership
// row goes either way (the content is gone), so this queue is the only record
// left that the blob still exists — the daily cron retries it.
const RETRY = "blob_delete_retry";
/** About a month of daily runs; past that it's a config problem (e.g. revoked token), not a blip. */
const MAX_DELETE_ATTEMPTS = 30;

/** Delete removed content's files; anything that fails is queued, never lost. */
export async function deleteFilesOrQueue(db: Db, urls: string[]): Promise<void> {
  const { failed } = await deleteBlobUrls(urls);
  if (failed.length) {
    await db.collection(RETRY).bulkWrite(
      failed.map((url) => ({
        updateOne: { filter: { url }, update: { $setOnInsert: { url, created_at: new Date() } }, upsert: true },
      }))
    );
  }
  await forgetUploads(db, urls);
}

/**
 * Retry queued deletes. Not gated on UPLOAD_CLEANUP_APPLY: these were already decided.
 * Least-recently-tried first, so a backlog larger than one batch rotates
 * through instead of retrying the same 200 forever. A row that keeps failing
 * stops being retried after MAX_DELETE_ATTEMPTS and is reported — it stays as
 * the record that the blob still exists.
 */
export async function retryFailedBlobDeletes(
  db: Db
): Promise<{ retried: number; deleted: number; gaveUp: number }> {
  const queue = db.collection<{ url: string; attempts?: number; last_attempt_at?: Date }>(RETRY);
  const rows = await queue
    .find({ attempts: { $not: { $gte: MAX_DELETE_ATTEMPTS } } })
    .sort({ last_attempt_at: 1 })
    .limit(BATCH)
    .toArray();
  if (!rows.length) return { retried: 0, deleted: 0, gaveUp: 0 };
  const { failed } = await deleteBlobUrls(rows.map((r) => r.url));
  const failedSet = new Set(failed);
  const done = rows.filter((r) => !failedSet.has(r.url));
  const stillFailing = rows.filter((r) => failedSet.has(r.url));
  if (done.length) await queue.deleteMany({ _id: { $in: done.map((r) => r._id) } });
  if (stillFailing.length) {
    await queue.updateMany(
      { _id: { $in: stillFailing.map((r) => r._id) } },
      { $inc: { attempts: 1 }, $set: { last_attempt_at: new Date() } }
    );
  }
  const gaveUp = stillFailing.filter((r) => (r.attempts ?? 0) + 1 >= MAX_DELETE_ATTEMPTS).length;
  if (gaveUp) {
    reportError(new Error(`${gaveUp} blob delete(s) failed ${MAX_DELETE_ATTEMPTS} times — no longer retried`), {
      route: "lib/upload-cleanup",
      service: "blob",
    });
  }
  return { retried: rows.length, deleted: done.length, gaveUp };
}
