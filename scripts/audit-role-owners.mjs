// Role-owner audit (SECURITY_AUDIT.md H1, verification step V1).
//
// Keeper/admin roles are granted to a *handle string*. When the account that
// held a handle renames or deletes itself, the role row stays and the handle
// can be registered by someone else, who then inherits the role. This lists
// every role entry and who (if anyone) holds that handle today, so the risky
// ones can be reviewed by a human.
//
// READ-ONLY. Only find()/countDocuments() are called; nothing is written.
//
//   MONGODB_URL=... MONGODB_DB=... node scripts/audit-role-owners.mjs
//   MONGODB_URL=... MONGODB_DB=... ADMIN_HANDLES=... node scripts/audit-role-owners.mjs --json
//
// Pass the production ADMIN_HANDLES value too: env admins have no DB row, so
// they are only checked when the variable is set.
//
// Status per entry:
//   ORPHANED        no account holds this handle — anyone can register it and get the role
//   OWNER_NEWER     the current holder's account was created after the role was granted
//                   (likely NOT the person it was granted to)
//   UNKNOWN_DATE    a holder exists but the grant date is unknown — review by hand
//   OK              the holder's account predates the grant
//
// Known blind spot: renames aren't logged, so an *older* account that renamed
// into a freed handle after the grant shows as OK. Eyeball the OK rows too.
//
// Exits 0 when nothing needs review, 1 when anything is ORPHANED/OWNER_NEWER/UNKNOWN_DATE, 2 on bad usage.
import { MongoClient, ObjectId } from "mongodb";

const URL_ = process.env.MONGODB_URL ?? process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB ?? "aithoughts";
const asJson = process.argv.includes("--json");

if (!URL_) {
  console.error("Set MONGODB_URL (and MONGODB_DB) to the cluster you are auditing.");
  process.exit(2);
}

const norm = (h) => String(h ?? "").trim().toLowerCase().replace(/^@/, "");

/** Best-known date for a row: an explicit field, else the ObjectId's creation time. */
function dateOf(row, fields) {
  for (const f of fields) {
    const v = row?.[f];
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v);
  }
  return row?._id instanceof ObjectId ? row._id.getTimestamp() : null;
}

const client = new MongoClient(URL_, { readPreference: "secondaryPreferred" });
try {
  await client.connect();
  const db = client.db(DB);

  const roles = [];
  for (const coll of ["admins", "keepers"]) {
    const rows = await db.collection(coll).find({}).toArray();
    for (const r of rows) {
      roles.push({ role: coll === "admins" ? "admin" : "keeper", source: "db", handle: r.handle, granted: dateOf(r, ["created_at", "createdAt"]) });
    }
  }
  const envAdmins = (process.env.ADMIN_HANDLES ?? "").split(/[,;\s]+/).map(norm).filter(Boolean);
  for (const h of envAdmins) roles.push({ role: "admin", source: "env", handle: `@${h}`, granted: null });

  // One query for every handle involved, matched the same way the app matches.
  const keys = [...new Set(roles.map((r) => norm(r.handle)).filter(Boolean))];
  const users = await db
    .collection("users")
    .find({ handle: { $in: keys.flatMap((k) => [k, `@${k}`]) } })
    .project({ handle: 1, createdAt: 1, created_at: 1, suspended: 1 })
    .toArray();
  const holders = new Map();
  for (const u of users) {
    const k = norm(u.handle);
    if (!holders.has(k)) holders.set(k, []);
    holders.get(k).push(u);
  }

  const out = roles.map((r) => {
    const found = holders.get(norm(r.handle)) ?? [];
    const owner = found[0] ?? null;
    const ownerCreated = owner ? dateOf(owner, ["createdAt", "created_at"]) : null;
    let status;
    if (!owner) status = "ORPHANED";
    else if (!r.granted || !ownerCreated) status = "UNKNOWN_DATE";
    else if (ownerCreated > r.granted) status = "OWNER_NEWER";
    else status = "OK";
    return {
      status,
      role: r.role,
      source: r.source,
      handle: r.handle,
      granted_at: r.granted?.toISOString() ?? null,
      owner_user_id: owner ? String(owner._id) : null,
      owner_created_at: ownerCreated?.toISOString() ?? null,
      owner_suspended: owner?.suspended === true,
      // More than one users row for one handle means the unique index is missing.
      duplicate_holders: found.length > 1 ? found.map((u) => String(u._id)) : [],
    };
  });

  const order = { ORPHANED: 0, OWNER_NEWER: 1, UNKNOWN_DATE: 2, OK: 3 };
  out.sort((a, b) => order[a.status] - order[b.status] || a.handle.localeCompare(b.handle));

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`Role entries: ${out.length} (db admins/keepers + ${envAdmins.length} env admins)\n`);
    console.table(
      out.map((o) => ({
        status: o.status,
        role: `${o.role}${o.source === "env" ? " (env)" : ""}`,
        handle: o.handle,
        granted_at: o.granted_at ?? "—",
        owner: o.owner_user_id ?? "—",
        owner_created_at: o.owner_created_at ?? "—",
        suspended: o.owner_suspended ? "yes" : "",
        dupes: o.duplicate_holders.length ? o.duplicate_holders.join(",") : "",
      }))
    );
    if (!envAdmins.length) console.log("\nNote: ADMIN_HANDLES not set here, so env admins were not checked.");
  }

  const needsReview = out.filter((o) => o.status !== "OK").length;
  process.exitCode = needsReview ? 1 : 0;
} finally {
  await client.close();
}
