import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { waitUntil } from "@vercel/functions";
import { del, list, put } from "@vercel/blob";
import { connectToDatabase } from "@/lib/mongodb";
import { buildArchive, verifyArchive, backupPathname } from "@/lib/backup";
import { selectExpiredBackups, DEFAULT_KEEP } from "@/lib/backup-retention";
import { authorizeCron } from "@/lib/cron-auth";
import { reportError } from "@/lib/report-error";

export const dynamic = "force-dynamic";

// Dumping, verifying, uploading and pruning all have to finish inside one
// invocation. If the function is killed mid-run the upload never happens, so the
// previous backup stays intact — the failure mode is a missed run, not a
// truncated archive.
export const maxDuration = 60;

// Sentry Crons alerts when a run reports an error or misses its slot (killed
// by the timeout, cron stopped, deploy broke the route). Without it a failing
// backup is silent until the day it is needed. Keep in sync with vercel.json.
const MONITOR = {
  schedule: { type: "crontab", value: "30 4 * * *" },
  timezone: "UTC",
  checkinMargin: 30,
  maxRuntime: 5,
} as const;

export async function GET(request: NextRequest) {
  const res = await runBackup(request);
  // Unauthorized callers are scanners, not runs.
  if (res.status !== 401) {
    Sentry.captureCheckIn({ monitorSlug: "db-backup", status: res.ok ? "ok" : "error" }, MONITOR);
    waitUntil(Sentry.flush(2000));
  }
  return res;
}

/**
 * GET /api/cron/backup — take a database backup and store it in Vercel Blob.
 *
 * Production's Atlas cluster is Free (M0), which has no Cloud Backup at any
 * setting, so this is the only recovery path that exists. Scheduled daily in
 * vercel.json.
 */
async function runBackup(request: NextRequest) {
  try {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Archives need a private store; the main store is public-only.
    const token = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "BLOB_PRIVATE_READ_WRITE_TOKEN is not set — no place to store the backup" },
        { status: 503 }
      );
    }

    const started = Date.now();
    const { db } = await connectToDatabase();
    const { buffer, archive } = await buildArchive(db);
    const built = Date.now();

    // Never store an archive we have not re-read. A truncated upload or a gzip
    // fault is caught here, seconds after it happened, instead of during a
    // real recovery months from now.
    const verified = await verifyArchive(buffer, {
      doc_count: archive.doc_count,
      collection_count: archive.collection_count,
    });

    const pathname = backupPathname(archive.db, archive.taken_at);

    let uploaded;
    try {
      uploaded = await put(pathname, buffer, {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/gzip",
        token,
      });
    } catch (e) {
      const message = (e as Error).message || String(e);
      // The archives contain real user data. If the store token only permits
      // public blobs, fail loudly rather than publishing a database dump.
      if (/public|store token|BlobAccessError|not allowed/i.test(message)) {
        return NextResponse.json(
          {
            error:
              "Blob store rejected access: \"private\". This archive holds real user data " +
              "and must not be stored publicly — use a read-write token with private access, " +
              "or store the dump outside Blob.",
            detail: message,
          },
          { status: 502 }
        );
      }
      throw e;
    }

    const keep = Number(process.env.BACKUP_KEEP ?? DEFAULT_KEEP) || DEFAULT_KEEP;
    const existing = await list({ prefix: "backups/", token });
    const blobs: Array<{ pathname: string; url: string; uploadedAt?: Date }> =
      (existing as { blobs?: Array<{ pathname: string; url: string; uploadedAt?: Date }> }).blobs ?? [];
    const expired = selectExpiredBackups(blobs, keep);
    if (expired.length) {
      await del(
        expired.map((p) => blobs.find((b) => b.pathname === p)?.url).filter((u): u is string => Boolean(u)),
        { token }
      );
    }

    return NextResponse.json({
      ok: true,
      db: archive.db,
      host: archive.host,
      taken_at: archive.taken_at,
      documents: verified.doc_count,
      collections: archive.collection_count,
      indexes: archive.index_count,
      bytes: buffer.byteLength,
      build_ms: built - started,
      total_ms: Date.now() - started,
      url: uploaded.url,
      pruned: expired.length,
      kept: keep,
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/cron/backup", service: "blob" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
