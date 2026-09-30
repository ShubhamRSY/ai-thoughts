// Links existing block/mute rows to the accounts involved (SECURITY_AUDIT.md H2).
//
// Old rows store handles ({ blocker: "@a", blocked: "@b" }), so a rename on
// either side dissolved the block. The app now keys rows by user id and still
// honors unlinked rows by handle, so nothing breaks before or during this.
// This adds blocker_id/blocked_id (muter_id/muted_id) to old rows. It never
// deletes a row and never guesses:
//   LINK        both handles are held by accounts that existed when the row was made
//   ORPHANED    a handle has no account now — usually someone already renamed away
//               (the exact bypass). There is no rename history to recover who it was,
//               so the row stays as it is (still matched by handle) for your review.
//   OWNER_NEWER a handle is now held by an account created after the row — probably
//               not the person meant. Left as is for review.
//   DUPLICATE   another row already links the same two accounts. Left as is (harmless).
//
// It also swaps the old unique index on the handle pair (which rejects id-only
// rows) for a plain one, and builds the id-pair unique index. The app does the
// same on its own; doing it here first just avoids the first write hitting it.
//
// DRY RUN BY DEFAULT — without --apply it only reads and prints the plan.
//
//   node scripts/migrate-blocks-mutes-to-user-id.mjs                 # plan
//   node scripts/migrate-blocks-mutes-to-user-id.mjs --apply         # link LINK rows
//   node scripts/migrate-blocks-mutes-to-user-id.mjs --verbose       # list every flagged row
//   node scripts/migrate-blocks-mutes-to-user-id.mjs --revert        # plan the undo
//   node scripts/migrate-blocks-mutes-to-user-id.mjs --revert --apply
//
// --revert: rows this script linked get exactly the added fields removed (their
// original handles were never touched). Rows the new app code created (ids
// only) get their accounts' *current* handles written in, so the old code can
// read them. Then the old unique index is restored.
import { ObjectId } from "mongodb";
import { norm, withDb } from "./audit-role-owners.mjs";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const revert = argv.includes("--revert");
const verbose = argv.includes("--verbose");
const MARK = "pairs-v1";
const SPECS = [
  { collection: "blocks", from: "blocker", to: "blocked" },
  { collection: "mutes", from: "muter", to: "muted" },
];

const dateOf = (v, oid) => {
  if (v instanceof Date) return v;
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v);
  return oid instanceof ObjectId ? oid.getTimestamp() : null;
};

async function holdersByHandle(db, handles) {
  const keys = [...new Set(handles.map(norm).filter(Boolean))];
  const rows = await db
    .collection("users")
    .find({ handle: { $in: keys.flatMap((k) => [k, `@${k}`]) } })
    .project({ handle: 1, createdAt: 1, created_at: 1 })
    .toArray();
  return new Map(rows.map((u) => [norm(u.handle), { id: String(u._id), created: dateOf(u.createdAt ?? u.created_at, u._id) }]));
}

async function handlesById(db, ids) {
  const oids = [...new Set(ids)].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const rows = oids.length ? await db.collection("users").find({ _id: { $in: oids } }).project({ handle: 1 }).toArray() : [];
  return new Map(rows.map((u) => [String(u._id), `@${norm(u.handle)}`]));
}

async function plan(db, spec) {
  const F = `${spec.from}_id`;
  const T = `${spec.to}_id`;
  const coll = db.collection(spec.collection);
  const legacy = await coll.find({ [F]: { $exists: false } }).toArray();
  const holders = await holdersByHandle(db, legacy.flatMap((r) => [String(r[spec.from] ?? ""), String(r[spec.to] ?? "")]));
  const linkedPairs = new Set(
    (await coll.find({ [F]: { $type: "string" } }).project({ [F]: 1, [T]: 1 }).toArray()).map((r) => `${r[F]}>${r[T]}`)
  );

  const out = { LINK: [], ORPHANED: [], OWNER_NEWER: [], DUPLICATE: [] };
  for (const r of legacy) {
    const made = dateOf(r.created_at, r._id);
    const a = holders.get(norm(String(r[spec.from] ?? "")));
    const b = holders.get(norm(String(r[spec.to] ?? "")));
    const row = { _id: r._id, from: r[spec.from], to: r[spec.to], made };
    if (!a || !b) out.ORPHANED.push({ ...row, why: `${!a ? spec.from : spec.to} handle has no account` });
    else if ((made && a.created > made) || (made && b.created > made)) {
      out.OWNER_NEWER.push({ ...row, why: `${a.created > made ? spec.from : spec.to} account is newer than the row` });
    } else if (a.id === b.id || linkedPairs.has(`${a.id}>${b.id}`)) {
      out.DUPLICATE.push({ ...row, why: a.id === b.id ? "both sides are the same account" : "pair already linked" });
    } else {
      linkedPairs.add(`${a.id}>${b.id}`);
      out.LINK.push({ ...row, fromId: a.id, toId: b.id });
    }
  }
  return out;
}

async function swapToIdIndexes(db, spec) {
  const coll = db.collection(spec.collection);
  const names = (await coll.indexes().catch(() => [])).map((i) => i.name);
  if (names.includes(`${spec.collection}_pair_unique`)) await coll.dropIndex(`${spec.collection}_pair_unique`);
  await coll.createIndex({ [spec.from]: 1, [spec.to]: 1 }, { name: `${spec.collection}_pair_legacy` });
  await coll.createIndex(
    { [`${spec.from}_id`]: 1, [`${spec.to}_id`]: 1 },
    { unique: true, partialFilterExpression: { [`${spec.from}_id`]: { $type: "string" } }, name: `${spec.collection}_ids_unique` }
  );
  await coll.createIndex({ [`${spec.to}_id`]: 1 }, { name: `${spec.collection}_${spec.to}_id` });
}

async function forward(db, spec) {
  const p = await plan(db, spec);
  console.log(`\n${spec.collection}: link ${p.LINK.length} · orphaned ${p.ORPHANED.length} · owner newer ${p.OWNER_NEWER.length} · duplicate ${p.DUPLICATE.length}`);
  for (const k of ["ORPHANED", "OWNER_NEWER", "DUPLICATE"]) {
    const rows = verbose ? p[k] : p[k].slice(0, 20);
    for (const r of rows) console.log(`  ${k.padEnd(11)} ${r._id}  ${r.from} → ${r.to}  (${r.why})`);
    if (rows.length < p[k].length) console.log(`  … ${p[k].length - rows.length} more ${k} (use --verbose)`);
  }
  if (!apply) return;
  await swapToIdIndexes(db, spec);
  let n = 0;
  for (const r of p.LINK) {
    const res = await db.collection(spec.collection).updateOne(
      { _id: r._id, [`${spec.from}_id`]: { $exists: false } },
      { $set: { [`${spec.from}_id`]: r.fromId, [`${spec.to}_id`]: r.toId, migrated_by: MARK, migrated_at: new Date() } }
    );
    n += res.modifiedCount;
  }
  console.log(`  linked ${n}`);
}

async function backward(db, spec) {
  const F = `${spec.from}_id`;
  const T = `${spec.to}_id`;
  const coll = db.collection(spec.collection);
  const mine = await coll.countDocuments({ migrated_by: MARK });
  const appRows = await coll.find({ [F]: { $type: "string" }, migrated_by: { $ne: MARK } }).toArray();
  const current = await handlesById(db, appRows.flatMap((r) => [r[F], r[T]]));
  const unresolved = appRows.filter((r) => !current.get(r[F]) || !current.get(r[T]));
  console.log(`\n${spec.collection}: ${mine} row(s) linked by this script → remove added fields`);
  console.log(`  ${appRows.length - unresolved.length} row(s) created by the app → write current handles, remove ids`);
  if (unresolved.length) console.log(`  ${unresolved.length} app row(s) name a deleted account → left unchanged (the old code ignores them)`);
  if (!apply) return;

  await coll.updateMany({ migrated_by: MARK }, { $unset: { [F]: "", [T]: "", migrated_by: "", migrated_at: "" } });
  for (const r of appRows) {
    const a = current.get(r[F]);
    const b = current.get(r[T]);
    if (!a || !b) continue;
    await coll.updateOne({ _id: r._id }, { $set: { [spec.from]: a, [spec.to]: b }, $unset: { [F]: "", [T]: "" } });
  }
  const names = (await coll.indexes().catch(() => [])).map((i) => i.name);
  for (const n of [`${spec.collection}_ids_unique`, `${spec.collection}_${spec.to}_id`, `${spec.collection}_pair_legacy`]) {
    if (names.includes(n)) await coll.dropIndex(n);
  }
  try {
    await coll.createIndex({ [spec.from]: 1, [spec.to]: 1 }, { unique: true, name: `${spec.collection}_pair_unique` });
    console.log("  restored the unique handle-pair index");
  } catch (e) {
    console.log(`  could not restore the unique handle-pair index (${e.message}) — duplicate handle pairs exist; remove them and re-run.`);
    process.exitCode = 1;
  }
}

await withDb(async (db) => {
  for (const spec of SPECS) await (revert ? backward(db, spec) : forward(db, spec));
  if (!apply) console.log(`\nDry run — nothing changed. Re-run with ${revert ? "--revert --apply" : "--apply"} to make these changes.`);
});
