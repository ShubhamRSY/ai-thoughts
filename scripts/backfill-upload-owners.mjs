// Records who owns each existing media file (SECURITY_AUDIT.md H3).
//
// Uploads from now on are recorded when they start (lib/uploads.ts). Files
// from before have no record, and until they do the app treats them
// conservatively: attaching them anywhere new is refused, and deleting a post
// removes one only if nothing else still uses it. This adds the missing
// records from what's in the database:
//   takes    media_url / stream_url on posts → owner = the post's user_id
//   avatars  avatar_url on profiles          → owner = the profile's account
// Skipped: sample/seed takes, and files nothing references (M4's cleanup).
// Never assigned, listed for your review instead:
//   CONFLICT       the same file is used by different accounts (usually the old
//                  attach bug — the earliest user is the likely owner, but that's
//                  your call), or as both a take and an avatar
//   SHARED         one account uses it on several posts; left unrecorded so
//                  deleting one post can't pull it from the others
//   NO_OWNER       the post/profile doesn't lead to an existing account
//
// DRY RUN BY DEFAULT — without --apply it only reads and prints the plan.
//
//   npm run -s backfill:uploads                     # plan
//   npm run -s backfill:uploads -- --apply          # write the records
//   npm run -s backfill:uploads -- --verbose        # list every flagged file
//   npm run -s backfill:uploads -- --revert         # plan the undo
//   npm run -s backfill:uploads -- --revert --apply # remove exactly what --apply added
//
// (MONGODB_URL / MONGODB_DB as for the other scripts. Reads Mongo only — it
// never talks to Blob.)
import { ObjectId } from "mongodb";
import { withDb, norm } from "./audit-role-owners.mjs";
import { uploadKeyForUrl } from "../src/lib/uploads.ts";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const revert = argv.includes("--revert");
const verbose = argv.includes("--verbose");

const isBlob = (u) => typeof u === "string" && uploadKeyForUrl(u) !== null;

await withDb(async (db) => {
  const uploads = db.collection("uploads");
  if (revert) {
    const n = await uploads.countDocuments({ backfilled: true });
    console.log(`${n} backfilled ownership record(s) would be removed.`);
    if (apply) console.log(`Removed ${(await uploads.deleteMany({ backfilled: true })).deletedCount}.`);
    else console.log("Dry run — nothing changed. Re-run with --revert --apply.");
    return;
  }

  // key → every use of that file
  const uses = new Map();
  const use = (url, u) => {
    const key = uploadKeyForUrl(url);
    if (!uses.has(key)) uses.set(key, { key, url, list: [] });
    uses.get(key).list.push(u);
  };

  for await (const p of db
    .collection("posts")
    .find({ is_seed: { $ne: true }, seed_id: { $exists: false } })
    .project({ media_url: 1, stream_url: 1, user_id: 1, created_at: 1 })) {
    for (const f of ["media_url", "stream_url"]) {
      if (isBlob(p[f])) use(p[f], { kind: "take", owner: typeof p.user_id === "string" ? p.user_id : null, post: String(p._id), at: p.created_at });
    }
  }

  const profiles = await db.collection("profiles").find({}).project({ avatar_url: 1, avatarUrl: 1, userId: 1, handle: 1 }).toArray();
  const byHandle = new Map(
    (
      await db
        .collection("users")
        .find({ handle: { $in: profiles.flatMap((p) => (p.handle ? [norm(p.handle), `@${norm(p.handle)}`] : [])) } })
        .project({ handle: 1 })
        .toArray()
    ).map((u) => [norm(u.handle), String(u._id)])
  );
  for (const p of profiles) {
    const url = [p.avatar_url, p.avatarUrl].find(isBlob);
    if (url) use(url, { kind: "avatar", owner: typeof p.userId === "string" ? p.userId : byHandle.get(norm(p.handle ?? "")) ?? null });
  }

  const ownerIds = [...new Set([...uses.values()].flatMap((x) => x.list.map((u) => u.owner)).filter((id) => id && ObjectId.isValid(id)))];
  const existing = new Set(
    (await db.collection("users").find({ _id: { $in: ownerIds.map((id) => new ObjectId(id)) } }).project({ _id: 1 }).toArray()).map((u) => String(u._id))
  );
  const recorded = new Set((await uploads.find({ key: { $in: [...uses.keys()] } }).project({ key: 1 }).toArray()).map((r) => r.key));

  const plan = { RECORD: [], ALREADY: [], CONFLICT: [], SHARED: [], NO_OWNER: [] };
  for (const x of uses.values()) {
    if (recorded.has(x.key)) { plan.ALREADY.push(x); continue; }
    const owners = new Set(x.list.map((u) => u.owner));
    const kinds = new Set(x.list.map((u) => u.kind));
    if (x.list.some((u) => !u.owner || !existing.has(u.owner))) plan.NO_OWNER.push({ ...x, why: "a use leads to no existing account" });
    else if (owners.size > 1 || kinds.size > 1) {
      const first = [...x.list].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0];
      plan.CONFLICT.push({ ...x, why: `${owners.size} accounts, ${[...kinds].join("+")}; earliest use by ${first.owner}` });
    } else if (x.list.length > 1) plan.SHARED.push({ ...x, why: `${x.list.length} posts by one account` });
    else plan.RECORD.push(x);
  }

  console.log(
    `files: record ${plan.RECORD.length} · already recorded ${plan.ALREADY.length} · conflict ${plan.CONFLICT.length} · shared ${plan.SHARED.length} · no owner ${plan.NO_OWNER.length}`
  );
  for (const k of ["CONFLICT", "SHARED", "NO_OWNER"]) {
    const rows = verbose ? plan[k] : plan[k].slice(0, 20);
    for (const x of rows) {
      console.log(`  ${k.padEnd(8)} ${x.key}  (${x.why})  used by: ${x.list.map((u) => u.post ?? `profile of ${u.owner}`).join(", ")}`);
    }
    if (rows.length < plan[k].length) console.log(`  … ${plan[k].length - rows.length} more ${k} (use --verbose)`);
  }

  if (!apply) {
    console.log("\nDry run — nothing changed. Re-run with --apply to write the RECORD rows.");
    return;
  }
  let n = 0;
  for (const x of plan.RECORD) {
    const u = x.list[0];
    const res = await uploads.updateOne(
      { key: x.key },
      {
        $setOnInsert: {
          key: x.key,
          owner_id: u.owner,
          kind: u.kind,
          private: /\.private\.blob\.vercel-storage\.com$/i.test(new URL(x.url).hostname),
          created_at: u.at instanceof Date ? u.at : new Date(),
          attached_to: u.kind === "take" ? u.post : `profile:${u.owner}`,
          backfilled: true,
          backfilled_at: new Date(),
        },
      },
      { upsert: true }
    );
    n += res.upsertedCount;
  }
  console.log(`\nRecorded ${n} file(s).`);
});
