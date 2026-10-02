// Restore an archive written by scripts/mongo-dump.mjs.
//
//   MONGODB_URL=... MONGODB_DB=... node scripts/mongo-restore.mjs <archive> [--dry-run] [--drop --confirm=<db>]
//
// --drop replaces each archived collection, so a restore into a non-empty
// database converges on the archive instead of merging into it. It loads into
// staging collections and swaps them in only if everything (documents and
// indexes) succeeded — a failed restore leaves the database untouched.
// Without it the restore is additive and will collide on unique indexes.
// --drop needs --confirm=<MONGODB_DB> so it can't be fired at the wrong
// database by accident. --dry-run prints what would be restored and exits.
// Exits non-zero if any document insert or index creation fails.
//
// Point this at a NEW database. Restoring over live data is how backups get
// destroyed instead of recovered.
import { MongoClient, BSON } from "mongodb";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

// mongodb v7 exports the BSON namespace rather than EJSON directly.
const { EJSON } = BSON;

const archive = process.argv[2];
const drop = process.argv.includes("--drop");
const dryRun = process.argv.includes("--dry-run");
const confirm = process.argv.find((a) => a.startsWith("--confirm="))?.slice("--confirm=".length);

if (!archive) {
  console.error("Usage: node scripts/mongo-restore.mjs <archive.json.gz> [--dry-run] [--drop --confirm=<db>]");
  process.exit(2);
}

const payload = JSON.parse(gunzipSync(readFileSync(archive)).toString("utf8"));
const DB = process.env.MONGODB_DB;
if (!DB) {
  console.error(`Set MONGODB_DB explicitly (the archive is db="${payload.db}").`);
  process.exit(2);
}
if (drop && confirm !== DB) {
  console.error(`--drop wipes every archived collection in "${DB}". Re-run with --confirm=${DB}.`);
  process.exit(2);
}

if (DB !== payload.db && !process.env.ALLOW_CROSS_DB) {
  console.error(`Refusing: archive is db="${payload.db}" but MONGODB_DB is "${DB}".`);
  console.error("Set ALLOW_CROSS_DB=1 to restore into a different database on purpose.");
  process.exit(2);
}

// Parse everything before touching the database, so a corrupt archive fails
// here rather than after --drop has emptied collections.
const parsed = Object.entries(payload.collections).map(([name, docs]) => [
  name,
  docs.map((d) => EJSON.parse(d, { relaxed: false })),
]);

if (dryRun) {
  for (const [name, docs] of parsed) console.log(`  ${String(docs.length).padStart(7)}  ${name}`);
  console.log(`\nDry run: would restore into db="${DB}"${drop ? " after dropping" : ""}. Nothing written.`);
  process.exit(0);
}

const client = await MongoClient.connect(process.env.MONGODB_URL ?? process.env.MONGODB_URI, {
  tls: process.env.TLS === "0" ? false : true,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  family: 4,
});
const db = client.db(DB);

console.log(`Restoring "${payload.db}" taken ${payload.taken_at} from ${payload.host}`);
console.log(`  into db="${DB}"${drop ? "  (replacing existing collections)" : ""}\n`);

function indexOptions(s) {
  return {
    name: s.name,
    unique: s.unique,
    sparse: s.sparse,
    ...(s.expireAfterSeconds !== undefined ? { expireAfterSeconds: s.expireAfterSeconds } : {}),
    ...(s.partialFilterExpression ? { partialFilterExpression: EJSON.parse(s.partialFilterExpression, { relaxed: false }) } : {}),
  };
}

/** Insert docs then build indexes into `target`; returns failure messages (empty = clean). */
async function load(target, name, docs) {
  const failures = [];
  if (docs.length) {
    try {
      await db.collection(target).insertMany(docs, { ordered: false });
    } catch (e) {
      failures.push(`${name}: ${e.result?.insertedCount ?? 0}/${docs.length} inserted — ${e.message.slice(0, 90)}`);
    }
  }
  // Indexes after the data: faster, and a unique index that won't build means
  // the restored data violates it — the restore is not trustworthy.
  for (const s of payload.indexes?.[name] ?? []) {
    // MongoDB creates _id_ itself and rejects an explicit `unique` on it.
    if (s.name === "_id_") continue;
    try {
      await db.collection(target).createIndex(EJSON.parse(s.key, { relaxed: false }), indexOptions(s));
    } catch (e) {
      failures.push(`${name}.${s.name}: ${e.message.slice(0, 90)}`);
    }
  }
  return failures;
}

let total = 0;
const failures = [];
try {
  if (drop) {
    // Replace mode never touches live data until the whole archive has loaded
    // cleanly: everything goes into "<name>__restore" staging collections
    // first, and only then is each one renamed over its live collection.
    // Any failure before the swap drops the staging copies and leaves the
    // database exactly as it was.
    const STAGE = "__restore";
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    for (const [name] of parsed) if (existing.has(name + STAGE)) await db.collection(name + STAGE).drop();

    for (const [name, docs] of parsed) {
      await db.createCollection(name + STAGE);
      failures.push(...(await load(name + STAGE, name, docs)));
      total += docs.length;
      console.log(`  ${String(docs.length).padStart(7)}  ${name}  (staged)`);
    }

    if (failures.length) {
      for (const [name] of parsed) await db.collection(name + STAGE).drop().catch(() => {});
      total = 0;
      console.log("\nStaging failed — live data was not touched:");
    } else {
      // Each rename (dropTarget) is atomic for its collection, and this loop
      // is metadata-only, so the window where some collections are swapped and
      // others aren't is milliseconds, not the length of the load.
      for (const [name] of parsed) {
        await db.collection(name + STAGE).rename(name, { dropTarget: true });
      }
      console.log("\nSwapped all staged collections into place.");
    }
  } else {
    // Additive mode merges into whatever is there and destroys nothing.
    for (const [name, docs] of parsed) {
      const f = await load(name, name, docs);
      failures.push(...f);
      total += docs.length;
      console.log(`  ${String(docs.length).padStart(7)}  ${name}${f.length ? "  (with failures)" : ""}`);
    }
  }
} finally {
  await client.close();
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${failures.length ? "Restore FAILED" : `${total} documents restored`}.`);
console.log(`Verify with: MONGODB_URL=... MONGODB_DB=${DB} node scripts/restore-drill-check.mjs`);
if (failures.length) process.exit(1);
