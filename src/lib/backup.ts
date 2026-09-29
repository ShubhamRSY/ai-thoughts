import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { BSON, type Db } from "mongodb";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// mongodb v7 exposes the BSON namespace rather than EJSON as a named export.
const { EJSON } = BSON;

/**
 * Database backup for a cluster that has no managed snapshots.
 *
 * `atlas-teal-basket` runs on Atlas Free (M0), which offers no Cloud Backup at
 * any setting, so the only way to be able to recover is to take our own. The
 * format is gzipped canonical Extended JSON: `ObjectId` / `Date` / `Decimal128`
 * / `Long` round-trip exactly, and `restoreArchive` puts them back unchanged.
 * It is deliberately self-describing — the archive records the db name, host
 * and every index, so a restore rebuilds the schema rather than just the rows.
 *
 * Limits, stated plainly: the whole database is held in memory and compressed in
 * one pass, so this is bounded by function memory and wall-clock. `MAX_DOCS`
 * fails loudly rather than letting a large collection OOM the function.
 */
export const BACKUP_FORMAT = "aithoughts-db-backup" as const;
export const BACKUP_VERSION = 1 as const;

/** Refuse rather than die mid-upload when the database outgrows this approach. */
export const MAX_DOCS = 200_000;

export type IndexSpec = {
  key: string;
  name: string;
  unique: boolean;
  sparse: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: string;
};

export type BackupArchive = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  db: string;
  host: string;
  taken_at: string;
  doc_count: number;
  collections: Record<string, string[]>;
  indexes: Record<string, IndexSpec[]>;
};

export type BuildResult = {
  buffer: Buffer;
  archive: Omit<BackupArchive, "collections" | "indexes"> & {
    collection_count: number;
    index_count: number;
  };
};

function hostOf(uri: string): string {
  try {
    return new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "https://")).host;
  } catch {
    return "(unparseable)";
  }
}

/** Read every non-system collection and serialise it to canonical EJSON. */
export async function buildArchive(db: Db, opts: { host?: string } = {}): Promise<BuildResult> {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."))
    .sort();

  const collections: Record<string, string[]> = {};
  const indexes: Record<string, IndexSpec[]> = {};
  let docCount = 0;
  let indexCount = 0;

  for (const name of names) {
    const docs: string[] = [];
    // Cursor iteration, not toArray() on a guessed count: this has to survive
    // the day a collection is too big to materialise twice.
    for await (const doc of db.collection(name).find({}, { timeoutMode: "iteration" })) {
      docs.push(EJSON.stringify(doc, { relaxed: false }));
      if (++docCount > MAX_DOCS) {
        throw new Error(
          `Backup aborted: more than ${MAX_DOCS} documents. The archive is built in ` +
            `memory, so a database this size needs a streaming dump instead.`
        );
      }
    }
    collections[name] = docs;

    const specs: IndexSpec[] = [];
    for (const idx of await db.collection(name).listIndexes().toArray()) {
      // _id_ is created by MongoDB itself and rejects an explicit `unique`.
      if (idx.name === "_id_") continue;
      specs.push({
        key: EJSON.stringify(idx.key, { relaxed: false }),
        name: idx.name,
        unique: idx.unique ?? false,
        sparse: idx.sparse ?? false,
        ...(idx.expireAfterSeconds !== undefined ? { expireAfterSeconds: idx.expireAfterSeconds } : {}),
        ...(idx.partialFilterExpression
          ? { partialFilterExpression: EJSON.stringify(idx.partialFilterExpression, { relaxed: false }) }
          : {}),
      });
      indexCount++;
    }
    indexes[name] = specs;
  }

  const archive = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    db: db.databaseName,
    host: opts.host ?? hostOf(process.env.MONGODB_URL ?? process.env.MONGODB_URI ?? ""),
    taken_at: new Date().toISOString(),
    doc_count: docCount,
    collections,
    indexes,
  };

  const buffer = await gzipAsync(Buffer.from(JSON.stringify(archive)), { level: 9 });
  return {
    buffer,
    archive: {
      format: archive.format,
      version: archive.version,
      db: archive.db,
      host: archive.host,
      taken_at: archive.taken_at,
      doc_count: archive.doc_count,
      collection_count: names.length,
      index_count: indexCount,
    },
  };
}

/**
 * Read the archive back and prove it is intact before anyone trusts it.
 *
 * A dump that has never been re-read is an assumption. This decompresses the
 * bytes we are about to store, re-parses every document, and checks the counts
 * still match — a truncated upload or a gzip fault fails here, not during an
 * actual recovery.
 */
export async function verifyArchive(
  buffer: Buffer,
  expected: { doc_count: number; collection_count: number }
): Promise<{ ok: true; doc_count: number }> {
  let parsed: BackupArchive;
  try {
    parsed = JSON.parse((await gunzipAsync(buffer)).toString("utf8"));
  } catch (e) {
    throw new Error(`Archive failed to decompress or parse: ${(e as Error).message}`);
  }

  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error(`Unexpected archive format "${parsed.format}"`);
  }

  const names = Object.keys(parsed.collections ?? {});
  let count = 0;
  for (const docs of Object.values(parsed.collections ?? {})) {
    count += docs.length;
    // Force a real BSON parse of every document, not just a length check —
    // canonical EJSON that cannot be parsed is exactly the failure worth
    // catching while the backup is still seconds old.
    for (const d of docs) EJSON.parse(d, { relaxed: false });
  }

  if (count !== expected.doc_count) {
    throw new Error(`Archive is short: re-read ${count} documents, expected ${expected.doc_count}`);
  }
  if (names.length !== expected.collection_count) {
    throw new Error(
      `Archive is missing collections: re-read ${names.length}, expected ${expected.collection_count}`
    );
  }
  return { ok: true, doc_count: count };
}

/** Stable, chronologically sortable pathname. No random suffix: pruning relies on this. */
export function backupPathname(dbName: string, takenAt: string, ext = "json.gz"): string {
  return `backups/${dbName}-${takenAt.replace(/[:.]/g, "-")}.${ext}`;
}
