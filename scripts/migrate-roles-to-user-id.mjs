// Links keeper/admin role rows to the account that holds them (SECURITY_AUDIT.md H1).
//
// The app now honors a role row only when it has `user_id`. This script adds
// that field to existing rows. It never deletes a row and never guesses:
//   - OK rows (the handle's current holder predates the grant) are linked.
//   - ORPHANED / OWNER_NEWER / UNKNOWN_DATE rows are listed for review and left
//     untouched — they grant nothing until you decide. After checking one by
//     hand, link it to its current holder with --approve @handle, or remove it
//     from /admin (or Atlas) if it shouldn't exist.
//
// DRY RUN BY DEFAULT: without --apply it only reads and prints the plan.
//
//   node scripts/migrate-roles-to-user-id.mjs                        # plan
//   node scripts/migrate-roles-to-user-id.mjs --apply                # link OK rows
//   node scripts/migrate-roles-to-user-id.mjs --apply --approve @sam # also link a reviewed row
//   node scripts/migrate-roles-to-user-id.mjs --revert               # plan the undo
//   node scripts/migrate-roles-to-user-id.mjs --revert --apply       # undo
//
// (MONGODB_URL / MONGODB_DB as for the other scripts.) Every row it links is
// marked migrated_by: "roles-v1"; --revert unsets exactly the fields it added
// on exactly those rows, so it can't touch roles granted by the new app code.
//
// Deploy order: run with --apply BEFORE deploying the H1 code. Deployed first,
// keepers/admins simply lose access until this runs (fails closed).
import { classifyRoles, norm, withDb } from "./audit-role-owners.mjs";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const revert = argv.includes("--revert");
const approved = new Set(
  argv.flatMap((a, i) => (argv[i - 1] === "--approve" ? [norm(a)] : []))
);
const MARK = "roles-v1";
const REVIEW = new Set(["ORPHANED", "OWNER_NEWER", "UNKNOWN_DATE"]);

const label = (r) => `${r.role.padEnd(6)} ${String(r.handle).padEnd(24)}`;

await withDb(async (db) => {
  if (revert) {
    const filter = { migrated_by: MARK };
    for (const coll of ["keepers", "admins"]) {
      const rows = await db.collection(coll).find(filter).project({ handle: 1, user_id: 1 }).toArray();
      console.log(`${coll}: ${rows.length} row(s) linked by this script`);
      for (const r of rows) console.log(`  ${r.handle}  user_id=${r.user_id}`);
      if (apply && rows.length) {
        const res = await db.collection(coll).updateMany(filter, {
          $unset: { user_id: "", migrated_at: "", migrated_by: "", migrated_from_status: "" },
        });
        console.log(`  reverted ${res.modifiedCount}`);
      }
    }
    if (!apply) console.log("\nDry run — nothing changed. Re-run with --revert --apply to undo.");
    return;
  }

  const entries = (await classifyRoles(db)).filter((e) => e.source === "db");
  const link = entries.filter(
    (e) => e.status === "OK" || (approved.has(norm(e.handle)) && (e.status === "OWNER_NEWER" || e.status === "UNKNOWN_DATE"))
  );
  const review = entries.filter((e) => REVIEW.has(e.status) && !link.includes(e));
  const done = entries.filter((e) => e.status === "LINKED");

  console.log(`Will link (${link.length}):`);
  for (const e of link) console.log(`  ${label(e)} → user ${e.owner_user_id}${e.status !== "OK" ? `  [approved, was ${e.status}]` : ""}`);
  console.log(`\nNeeds your review — left untouched, grants nothing (${review.length}):`);
  for (const e of review) {
    const why =
      e.status === "ORPHANED"
        ? "no account holds this handle"
        : e.status === "OWNER_NEWER"
          ? `holder ${e.owner_user_id} joined ${e.owner_created_at}, after the grant ${e.granted_at}`
          : `holder ${e.owner_user_id}, grant date unknown`;
    console.log(`  ${label(e)} ${e.status}: ${why}`);
  }
  console.log(`\nAlready linked (${done.length}).`);
  for (const h of approved) {
    if (!entries.some((e) => norm(e.handle) === h)) console.log(`\nWarning: --approve @${h} matched no role row.`);
  }
  if (entries.some((e) => e.status === "ORPHANED" && approved.has(norm(e.handle)))) {
    console.log("\nNote: ORPHANED rows can't be approved — there's no account to link them to.");
  }

  if (!apply) {
    console.log("\nDry run — nothing changed. Re-run with --apply to link the rows above.");
    return;
  }
  let n = 0;
  for (const e of link) {
    const res = await db.collection(e.collection).updateOne(
      { _id: e.row_id, user_id: { $exists: false } },
      {
        $set: {
          user_id: e.owner_user_id,
          migrated_at: new Date(),
          migrated_by: MARK,
          migrated_from_status: e.status,
        },
      }
    );
    n += res.modifiedCount;
  }
  console.log(`\nLinked ${n} row(s).`);
});
