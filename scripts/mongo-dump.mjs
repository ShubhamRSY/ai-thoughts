// Local file backup — writes the same archive as /api/cron/backup, off a machine
// you control. The archive format and the self-verification live in
// src/lib/backup.ts so the scheduled job and this CLI can never drift apart.
//
//   MONGODB_URL=... MONGODB_DB=... node --experimental-strip-types scripts/mongo-dump.mjs [outfile]
//
// The --experimental-strip-types flag is the same one `npm test` already uses
// (scripts/ is plain .mjs, the shared core is .ts).
//
// The archive contains real user data (handles, post text, encrypted emails).
// Treat it as a secret: keep it out of the repo and off shared storage.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MongoClient } from "mongodb";
import { buildArchive, verifyArchive } from "../src/lib/backup.ts";

const URL_ = process.env.MONGODB_URL ?? process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB;

if (!URL_ || !DB) {
  console.error("Set MONGODB_URL (and MONGODB_DB).");
  process.exit(2);
}

const client = await MongoClient.connect(URL_, {
  tls: process.env.TLS === "0" ? false : true,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  family: 4,
});

try {
  const { buffer, archive } = await buildArchive(client.db(DB));

  // Re-read before writing, same guarantee the cron makes.
  const verified = await verifyArchive(buffer, {
    doc_count: archive.doc_count,
    collection_count: archive.collection_count,
  });

  const out = resolve(process.argv[2] ?? `backups/${DB}-${archive.taken_at.replace(/[:.]/g, "-")}.json.gz`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buffer);

  console.log(`Dumped db="${archive.db}" host=${archive.host}`);
  console.log(`  ${verified.doc_count} documents across ${archive.collection_count} collections, ${archive.index_count} indexes`);
  console.log(`Wrote ${out} (${buffer.byteLength} bytes)`);
  console.log(`\nRestore with:\n  MONGODB_URL=... MONGODB_DB=${DB} node --experimental-strip-types scripts/mongo-restore.mjs ${out} --drop --confirm=${DB}`);
} finally {
  await client.close();
}
