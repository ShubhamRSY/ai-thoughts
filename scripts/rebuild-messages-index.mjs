// Repairs the messages reply-thread index when it exists under MongoDB's
// auto-generated name instead of the one lib/indexes.ts asks for.
//
// lib/indexes.ts builds { post_id: 1, created_at: 1 } as "messages_post_created"
// (reply threads + per-post reply counts on every feed page). A build from
// before that index was named created the same keys as "post_id_1_created_at_1".
// MongoDB then rejects every attempt to build it under the intended name
// (IndexKeySpecsConflict 86 / IndexOptionsConflict 85 — same keys, different
// name), and lib/indexes.ts swallows that rejection, so the collection stays
// silently unindexed and each feed load scans every reply ever written.
//
// This drops the stale name and builds the named index. lib/indexes.ts now does
// the same repair on its own at boot, so this script is only needed to fix a
// live database without waiting for a deploy.
//
// DRY RUN BY DEFAULT — without --apply it only reads and prints the plan.
//
//   node scripts/rebuild-messages-index.mjs            # plan
//   node scripts/rebuild-messages-index.mjs --apply    # drop the stale name, rebuild
//
// No rows are read or written: an index carries no user data, so there is
// nothing to back up and nothing to revert. Dropping and rebuilding an index
// leaves the collection fully readable throughout; queries just scan until the
// new index finishes.
//
// (MONGODB_URL / MONGODB_DB as for the other scripts.) Exits 1 if the index is
// still not named correctly once the script finishes, so it can gate a deploy.
import { withDb } from "./audit-role-owners.mjs";

const KEYS = { post_id: 1, created_at: 1 };
const WANTED = "messages_post_created";

// Index key specs are order-sensitive, so compare entry-by-entry rather than
// as a set — {a:1,b:1} and {b:1,a:1} are different indexes to MongoDB.
const sameKeySpec = (a, b) => {
  const ka = Object.entries(a);
  const kb = Object.entries(b);
  return ka.length === kb.length && ka.every(([k, v], i) => kb[i][0] === k && kb[i][1] === v);
};

const apply = process.argv.slice(2).includes("--apply");

const state = (indexes) => {
  const matching = indexes.filter((i) => sameKeySpec(i.key, KEYS));
  if (matching.some((i) => i.name === WANTED)) return "OK";
  if (matching.length) return "CONFLICT";
  return "MISSING";
};

await withDb(async (db) => {
  const messages = db.collection("messages");
  const before = await messages.indexes();
  const status = state(before);

  console.log(`messages: ${before.length} index(es); ${await messages.estimatedDocumentCount()} document(s)\n`);
  for (const i of before) {
    const keys = Object.entries(i.key).map(([k, v]) => `${k}:${v}`).join(", ");
    console.log(`  ${i.name.padEnd(34)} { ${keys} }${i.unique ? "  unique" : ""}`);
  }

  if (status === "OK") {
    console.log(`\n${WANTED} is already in place — nothing to do.`);
    return;
  }

  const stale = before.filter((i) => sameKeySpec(i.key, KEYS) && i.name !== WANTED);
  if (status === "CONFLICT") {
    console.log(
      `\nCONFLICT: { post_id: 1, created_at: 1 } exists as ${stale.map((i) => `"${i.name}"`).join(", ")}, ` +
        `which blocks the build of "${WANTED}" (code 85/86).`
    );
  } else {
    console.log(`\nMISSING: no index on { post_id: 1, created_at: 1 }.`);
  }

  if (!apply) {
    console.log(
      `\nDry run — nothing changed. Re-run with --apply to build "${WANTED}"` +
        `${stale.length ? ` (dropping ${stale.map((i) => `"${i.name}"`).join(", ")})` : ""}.`
    );
    return;
  }

  for (const i of stale) {
    await messages.dropIndex(i.name);
    console.log(`Dropped "${i.name}".`);
  }
  await messages.createIndex(KEYS, { name: WANTED });
  console.log(`Built "${WANTED}".`);

  // lib/indexes.ts logs these rejections without failing /api/health, so a
  // successful createIndex call is the only trustworthy confirmation.
  const after = await messages.indexes();
  if (state(after) !== "OK") {
    console.error(`\nStill ${state(after)} after the rebuild:`, after.map((i) => i.name).join(", "));
    process.exitCode = 1;
    return;
  }
  console.log(`\nVerified: "${WANTED}" is in place. Confirm in Atlas → messages → Indexes.`);
});