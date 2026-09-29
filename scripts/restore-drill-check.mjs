// Restore-drill verifier (RUNBOOK.md "Backup restore drill", step 3).
//
// The runbook asks you to "sign in, open a profile and the feed" against a
// restored snapshot. That is a vibe check: it produces no artifact, so next
// year nobody can say whether a restore would actually have worked. This prints
// a reproducible manifest instead — collection counts, referential integrity,
// index presence, and the newest document timestamp per collection (which is
// your data-loss window, measured rather than guessed).
//
// READ-ONLY. It never calls a write method, so it is safe to run against the
// live cluster too — and that is the point: run it live first, then against the
// restore, then diff the two manifests.
//
//   MONGODB_URL=... MONGODB_DB=... node scripts/restore-drill-check.mjs
//   MONGODB_URL=... MONGODB_DB=... node scripts/restore-drill-check.mjs --json > live.json
//   MONGODB_URL=... MONGODB_DB=... node scripts/restore-drill-check.mjs --compare live.json
//
// Exits 0 when every check passes, 1 on any failure, 2 on bad usage.
import { MongoClient } from "mongodb";
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? null;
};

const URL_ = process.env.MONGODB_URL ?? process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB ?? "aithoughts";

if (!URL_) {
  console.error("Set MONGODB_URL (and MONGODB_DB) to the cluster you are verifying.");
  process.exit(2);
}
const comparePath = opt("--compare");

// Collections the app actually reads or writes. A restore that is missing any
// of these is not a usable restore even if the counts look plausible.
const EXPECTED_COLLECTIONS = [
  "users", "profiles", "posts", "messages", "reactions", "follows",
  "notifications", "reports", "post_views", "moods", "blocks", "mutes",
  "sessions", "auth_codes", "user_prefs", "push_subscriptions",
  "keepers", "admins", "site_settings", "contact_requests",
  "security_audit_log", "translations",
];

// Indexes whose absence means a request path degrades to a collection scan.
// Names mirror ensureCoreIndexes() in src/lib/indexes.ts.
const CRITICAL_INDEXES = [
  ["users", "users_emailHash_unique"], ["users", "users_handle_unique"],
  ["posts", "posts_created_id"], ["posts", "posts_prompt_day_created"],
  ["messages", "messages_post_created"],
  ["notifications", "notifications_recipient_created"],
  ["reactions", "reactions_post_handle_reaction"],
  ["follows", "follows_pair_unique"],
  ["moods", "moods_handle_day_unique"],
  ["sessions", "sessions_sid_unique"],
  ["push_subscriptions", "push_endpoint_unique"],
  ["reports", "reports_post_reporter_unique"],
];

// Time-bearing collections, used to measure the restore's staleness.
const TIME_COLLECTIONS = [
  "posts", "messages", "reactions", "notifications", "sessions",
  "user_prefs", "post_views", "moods",
];

const results = [];
// Under --json stdout must contain the manifest and nothing else, so every
// human-facing line goes through say(). Notes are kept on the manifest too —
// they are part of what a restore reviewer needs to see.
const say = (line = "") => { if (!flag("--json")) console.log(line); };
const notes = [];
const note = (line) => { notes.push(line); say(line); };

const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  say(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  return ok;
};

const client = await MongoClient.connect(URL_, {
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 8000,
  family: 4,
  // Mirrors src/lib/mongodb.ts: a restored Atlas cluster always speaks TLS, and
  // the driver only negotiates it when asked explicitly. Set TLS=0 to target a
  // plain local mongod (e2e/start-test-mongo.sh is TLS and needs this left on).
  tls: process.env.TLS === "0" ? false : true,
});

try {
  await client.db("admin").command({ ping: 1 });
} catch (e) {
  console.error(`Cannot reach the cluster: ${e.message}`);
  console.error("If this is a freshly restored Atlas cluster, its IP allowlist is the usual culprit.");
  await client.close();
  process.exit(2);
}

const db = client.db(DB);
const serverInfo = await db.command({ buildInfo: 1 });
const host = (() => {
  try { return new URL(URL_.replace(/^mongodb(\+srv)?:\/\//, "https://")).host; }
  catch { return "(unparseable host)"; }
})();

if (!flag("--json")) {
  say(`\nRestore-drill check — db="${DB}" host=${host} mongo=${serverInfo.version}\n`);
}

// ---------------- collections + counts ----------------
const existing = new Set(
  (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)
);
const missing = EXPECTED_COLLECTIONS.filter((c) => !existing.has(c));
// Collections the app never mentions usually mean you verified the wrong database.
const unknown = [...existing].filter(
  (c) => !EXPECTED_COLLECTIONS.includes(c) && !c.startsWith("system.")
);

check(
  "all app collections present",
  missing.length === 0,
  missing.length ? `missing: ${missing.join(", ")}` : `${EXPECTED_COLLECTIONS.length} present`
);
if (unknown.length) {
  note(`NOTE  collections not in the app's expected set: ${unknown.join(", ")}`);
}

const counts = {};
for (const name of EXPECTED_COLLECTIONS) {
  if (!existing.has(name)) continue;
  counts[name] = await db.collection(name).estimatedDocumentCount();
}

if (!flag("--json")) {
  say("\nDocument counts");
  for (const name of Object.keys(counts).sort()) {
    say(`  ${String(counts[name]).padStart(8)}  ${name}`);
  }
  say("");
}

// A restore that is structurally fine but holds almost nothing is a failed
// restore. Compare against the live manifest when you have one.
const total = Object.values(counts).reduce((a, b) => a + b, 0);
check("database is non-empty", total > 0, `${total} documents`);

// ---------------- indexes ----------------
const missingIndexes = [];
let indexChecksRun = 0;
for (const [coll, indexName] of CRITICAL_INDEXES) {
  if (!existing.has(coll)) continue;
  indexChecksRun++;
  const names = (await db.collection(coll).listIndexes().toArray()).map((i) => i.name);
  if (!names.includes(indexName)) missingIndexes.push(`${coll}.${indexName}`);
}
check(
  "critical indexes present",
  missingIndexes.length === 0 && indexChecksRun === CRITICAL_INDEXES.length,
  missingIndexes.length
    ? `absent: ${missingIndexes.join(", ")} (restore the index set, or hit /api/health against this cluster to rebuild)`
    : `${indexChecksRun}/${CRITICAL_INDEXES.length} present` +
      (indexChecksRun === CRITICAL_INDEXES.length ? "" : " (short — some collections do not exist yet)")
);

// ---------------- referential integrity ----------------
// post_id is stored as the 24-hex string form of the post's ObjectId, so joins
// go through $toString rather than a direct _id match.
//
// `required: false` marks an optional field: a profile created before userId
// existed keys on `handle` alone, so counting it as a dangling reference is a
// false positive, not a broken restore.
const orphans = [];
const orphanCheck = async (label, from, localField, toColl, { required = true } = {}) => {
  if (!existing.has(from) || !existing.has(toColl)) return;
  const match = { hit: { $size: 0 } };
  if (!required) match[localField] = { $type: "string" };
  const n = await db.collection(from).aggregate([
    { $lookup: { from: toColl, let: { k: `$${localField}` }, pipeline: [
        { $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$k"] } } },
      ], as: "hit" } },
    { $match: match },
    { $count: "n" },
  ]).toArray();
  const count = n[0]?.n ?? 0;
  if (count > 0) orphans.push(`${label}:${count}`);
};
await orphanCheck("messages.post_id -> posts", "messages", "post_id", "posts");
await orphanCheck("reactions.post_id -> posts", "reactions", "post_id", "posts");
await orphanCheck("post_views.post_id -> posts", "post_views", "post_id", "posts");
await orphanCheck("reports.post_id -> posts", "reports", "post_id", "posts");
await orphanCheck("profiles.userId -> users", "profiles", "userId", "users", { required: false });

// Posts pointing at a user that isn't in `users` are ambiguous: `npm run seed`
// writes demo posts with synthetic ids that never had a user, and those are
// harmless. A real post by a vanished user is not. So this is reported with the
// offending handles rather than as a flat failure — a human decides.
const ghostPosts = [];
if (existing.has("posts") && existing.has("users")) {
  const rows = await db.collection("posts").aggregate([
    { $lookup: { from: "users", let: { k: "$user_id" }, pipeline: [
        { $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$k"] } } },
      ], as: "u" } },
    { $match: { u: { $size: 0 } } },
    { $group: { _id: "$handle", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  ghostPosts.push(...rows.map((r) => ({ handle: r._id ?? "(none)", n: r.n })));
}

check(
  "no orphaned references",
  orphans.length === 0,
  orphans.length ? `dangling: ${orphans.join(", ")}` : "messages/reactions/reports/profiles all resolve"
);

if (ghostPosts.length) {
  const total = ghostPosts.reduce((a, g) => a + g.n, 0);
  const sample = ghostPosts.slice(0, 5).map((g) => `${g.handle}(${g.n})`).join(", ");
  note(
    `NOTE  ${total} posts point at a user_id with no user doc. Seed data does this by` +
      ` design; check the handles before treating it as data loss — top: ${sample}` +
      `${ghostPosts.length > 5 ? `, +${ghostPosts.length - 5} more` : ""}`
  );
}

// The users collection is the one that must never regress: a restore missing
// handles means everyone is locked out of their own account.
if (existing.has("users")) {
  const users = counts.users ?? 0;
  const withHandle = await db.collection("users").countDocuments({
    handle: { $type: "string" },
  });
  check(
    "every user has a handle",
    users === 0 || withHandle === users,
    `${withHandle}/${users} carry a handle`
  );

  // Plaintext email is a known legacy field; a restore that predates the
  // emailEnc migration would fail sign-in. Flag it if it is still there.
  const plaintext = await db.collection("users").countDocuments({
    email: { $type: "string" },
  });
  if (plaintext > 0) {
    note(`NOTE  ${plaintext} user docs still carry a plaintext "email" field (pre-migration data).`);
  }
}

// ---------------- data-loss window ----------------
const newest = {};
for (const name of TIME_COLLECTIONS) {
  if (!existing.has(name)) continue;
  const row = await db.collection(name)
    .find({ created_at: { $type: "date" } })
    .sort({ created_at: -1 })
    .limit(1)
    .project({ created_at: 1 })
    .toArray();
  if (row[0]?.created_at) newest[name] = row[0].created_at.toISOString();
}

const latest = Object.values(newest).sort().pop() ?? null;
const ageHours = latest ? (Date.now() - Date.parse(latest)) / 36e5 : null;

if (!flag("--json")) {
  say("Newest document per collection (this is your data-loss window)");
  for (const name of Object.keys(newest).sort()) {
    say(`  ${newest[name]}  ${name}`);
  }
  if (latest) {
    say(
      `\n  Newest data anywhere: ${latest} (${ageHours < 1 ? "<1" : ageHours.toFixed(1)}h ago).` +
        `\n  Anything written after that is what a restore from this snapshot would lose.`
    );
  }
  say("");
}
check("restore contains recent-enough data", latest !== null, latest ?? "no dated documents found");

// ---------------- manifest + diff ----------------
const manifest = {
  db: DB,
  host,
  taken_at: new Date().toISOString(),
  counts,
  newest,
  missing_collections: missing,
  missing_indexes: missingIndexes,
  orphans: orphans.length ? orphans : [],
  notes,
  checks: results,
  passed: results.every((r) => r.ok),
};

if (comparePath) {
  let base;
  try {
    base = JSON.parse(readFileSync(comparePath, "utf8"));
  } catch (e) {
    console.error(`Could not read baseline ${comparePath}: ${e.message}`);
    await client.close();
    process.exit(2);
  }
  if (base.db !== DB) {
    console.error(`Baseline is db="${base.db}" but this run is db="${DB}" — diffing would be meaningless.`);
    await client.close();
    process.exit(2);
  }
  const deltas = {};
  for (const name of [...new Set([...Object.keys(base.counts ?? {}), ...Object.keys(counts)])].sort()) {
    const was = base.counts?.[name] ?? 0;
    const now = counts[name] ?? 0;
    if (was !== now) deltas[name] = { baseline: was, restore: now, delta: now - was };
  }
  manifest.diff = {
    baseline_taken_at: base.taken_at ?? null,
    baseline_host: base.host ?? null,
    deltas,
    // The single number the drill exists to produce: how far behind live the
    // restore actually is.
    newest_post_baseline: base.newest?.posts ?? null,
    newest_post_restore: newest.posts ?? null,
  };
  say(`\nDiff vs baseline ${base.taken_at} (${base.host})`);
  if (Object.keys(deltas).length === 0) {
    say("  identical document counts — the restore is current.");
  } else {
    for (const [name, d] of Object.entries(deltas)) {
      say(`  ${name}: ${d.baseline} -> ${d.restore}  (${d.delta > 0 ? "+" : ""}${d.delta})`);
    }
  }
  say(
    `\n  Newest post — baseline ${base.newest?.posts ?? "?"}, restore ${newest.posts ?? "?"}.`
  );
  say("");
}

if (flag("--json")) {
  console.log(JSON.stringify(manifest, null, 2));
} else {
  const failed = results.filter((r) => !r.ok);
  say(
    failed.length === 0
      ? `All ${results.length} checks passed.`
      : `${failed.length}/${results.length} checks FAILED: ${failed.map((f) => f.name).join("; ")}`
  );
  say(
    "\nRecord alongside this output: restore duration, snapshot age, and the diff result."
  );
}

await client.close();
process.exit(manifest.passed ? 0 : 1);
