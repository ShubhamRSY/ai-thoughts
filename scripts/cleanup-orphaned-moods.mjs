// Removes mood check-ins left behind by renames before H2 (SECURITY_AUDIT.md).
//
// Mood rows are keyed by handle. Until H2, renaming didn't move them, so an
// old handle kept its owner's mood history — and whoever registered that
// handle later was shown it as their own. This finds:
//   UNHELD     the handle has no account now
//   INHERITED  the row is older than the account that holds the handle now
// Rows made by the current holder are never touched.
//
// DRY RUN BY DEFAULT — without --apply it only reads and prints counts.
//
//   node scripts/cleanup-orphaned-moods.mjs                       # plan
//   node scripts/cleanup-orphaned-moods.mjs --apply               # back up, then delete
//   node scripts/cleanup-orphaned-moods.mjs --revert <file>       # plan the restore
//   node scripts/cleanup-orphaned-moods.mjs --revert <file> --apply
//
// --apply first writes every row it will delete to backups/ (git-ignored;
// it holds personal data — delete it once you're sure), then deletes exactly
// those rows. --revert re-inserts them from that file.
import { BSON, ObjectId } from "mongodb";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { withDb, norm } from "./audit-role-owners.mjs";

// mongodb v7 exports the BSON namespace rather than EJSON directly (as in mongo-restore.mjs).
const { EJSON } = BSON;

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const revertFile = argv.includes("--revert") ? argv[argv.indexOf("--revert") + 1] : null;

const dateOf = (v, oid) => {
  if (v instanceof Date) return v;
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v);
  return oid instanceof ObjectId ? oid.getTimestamp() : null;
};

await withDb(async (db) => {
  const moods = db.collection("moods");

  if (revertFile) {
    const rows = EJSON.parse(readFileSync(revertFile, "utf8"), { relaxed: false });
    const present = new Set((await moods.find({ _id: { $in: rows.map((r) => r._id) } }).project({ _id: 1 }).toArray()).map((r) => String(r._id)));
    const missing = rows.filter((r) => !present.has(String(r._id)));
    console.log(`${rows.length} row(s) in the backup; ${missing.length} not in the database and would be restored.`);
    if (apply && missing.length) {
      const res = await moods.insertMany(missing, { ordered: false }).catch((e) => e.result ?? { insertedCount: 0 });
      console.log(`Restored ${res.insertedCount ?? 0}.`);
    } else if (!apply) console.log("Dry run — nothing changed. Add --apply to restore.");
    return;
  }

  const keys = await moods.distinct("handle_norm");
  const users = await db
    .collection("users")
    .find({ handle: { $in: keys.flatMap((k) => [k, `@${k}`]) } })
    .project({ handle: 1, createdAt: 1, created_at: 1 })
    .toArray();
  const heldSince = new Map(users.map((u) => [norm(u.handle), dateOf(u.createdAt ?? u.created_at, u._id)]));

  const doomed = [];
  const counts = { UNHELD: 0, INHERITED: 0, KEPT: 0 };
  for await (const m of moods.find({})) {
    const since = heldSince.get(m.handle_norm);
    const made = dateOf(m.created_at, m._id);
    if (!heldSince.has(m.handle_norm)) {
      counts.UNHELD++;
      doomed.push(m);
    } else if (since && made && made < since) {
      counts.INHERITED++;
      doomed.push(m);
    } else counts.KEPT++;
  }
  console.log(`mood rows: unheld ${counts.UNHELD} · inherited by a later account ${counts.INHERITED} · kept ${counts.KEPT}`);
  if (!apply) {
    console.log("Dry run — nothing changed. Re-run with --apply to back up and delete the first two groups.");
    return;
  }
  if (!doomed.length) return console.log("Nothing to delete.");
  mkdirSync("backups", { recursive: true });
  const file = `backups/orphaned-moods-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, EJSON.stringify(doomed, { relaxed: false }));
  const res = await moods.deleteMany({ _id: { $in: doomed.map((m) => m._id) } });
  console.log(`Backed up ${doomed.length} row(s) to ${file}; deleted ${res.deletedCount}.`);
  console.log(`Undo with: node scripts/cleanup-orphaned-moods.mjs --revert ${file} --apply`);
});
