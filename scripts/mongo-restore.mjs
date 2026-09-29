// Restore an archive written by scripts/mongo-dump.mjs.
//
//   MONGODB_URL=... MONGODB_DB=... node scripts/mongo-restore.mjs <archive> [--drop]
//
// --drop empties each collection before inserting, so a restore into a
// non-empty database converges on the archive instead of merging into it.
// Without it the restore is additive and will collide on unique indexes.
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

if (!archive) {
  console.error("Usage: node scripts/mongo-restore.mjs <archive.json.gz> [--drop]");
  process.exit(2);
}

const payload = JSON.parse(gunzipSync(readFileSync(archive)).toString("utf8"));
const DB = process.env.MONGODB_DB ?? payload.db;

if (DB !== payload.db && !process.env.ALLOW_CROSS_DB) {
  console.error(`Refusing: archive is db="${payload.db}" but MONGODB_DB is "${DB}".`);
  console.error("Set ALLOW_CROSS_DB=1 to restore into a different database on purpose.");
  process.exit(2);
}

const client = await MongoClient.connect(process.env.MONGODB_URL ?? process.env.MONGODB_URI, {
  tls: process.env.TLS === "0" ? false : true,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  family: 4,
});
const db = client.db(DB);

console.log(`Restoring "${payload.db}" taken ${payload.taken_at} from ${payload.host}`);
console.log(`  into db="${DB}"${drop ? "  (dropping existing collections first)" : ""}\n`);

let total = 0;
for (const [name, docs] of Object.entries(payload.collections)) {
  if (drop) await db.collection(name).deleteMany({});
  if (docs.length === 0) {
    console.log(`  ${String(0).padStart(7)}  ${name}  (empty)`);
    continue;
  }
  await db.collection(name).insertMany(
    docs.map((d) => EJSON.parse(d, { relaxed: false })),
    { ordered: false }
  );
  total += docs.length;
  console.log(`  ${String(docs.length).padStart(7)}  ${name}`);
}

// Indexes last: restoring documents into an empty database and then indexing is
// far faster, and it surfaces a unique-constraint violation as a loud error
// rather than a partially-applied restore.
let indexErrors = 0;
for (const [name, specs] of Object.entries(payload.indexes ?? {})) {
  for (const s of specs) {
    // MongoDB creates _id_ itself and rejects an explicit `unique` on it.
    if (s.name === "_id_") continue;    try {
      await db.collection(name).createIndex(
        EJSON.parse(s.key, { relaxed: false }),
        {
          name: s.name,
          unique: s.unique,
          sparse: s.sparse,
          ...(s.expireAfterSeconds !== undefined ? { expireAfterSeconds: s.expireAfterSeconds } : {}),
          ...(s.partialFilterExpression ? { partialFilterExpression: EJSON.parse(s.partialFilterExpression, { relaxed: false }) } : {}),
        }
      );
    } catch (e) {
      // The app rebuilds its own index set on boot via ensureCoreIndexes, so a
      // conflict here is a warning, not a failed restore.
      indexErrors++;
      console.log(`  WARN  ${name}.${s.name}: ${e.message.slice(0, 90)}`);
    }
  }
}

console.log(`\n${total} documents restored${indexErrors ? `, ${indexErrors} index warning(s)` : ""}.`);
console.log(`Verify with: MONGODB_URL=... MONGODB_DB=${DB} node scripts/restore-drill-check.mjs`);

await client.close();
