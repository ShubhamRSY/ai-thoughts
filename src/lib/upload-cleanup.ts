import type { Db } from "mongodb";
import { del, list } from "@vercel/blob";
import { privateBlobToken } from "./media-access.ts";
import { UNATTACHED_GRACE_MS, type UploadRow } from "./uploads.ts";

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
