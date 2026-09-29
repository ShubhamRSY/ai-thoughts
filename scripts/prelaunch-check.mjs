// Pre-launch checklist gate: drives the real API through every launch rule
// (OTP, profiles, posting, interactions, search/blocks, IDOR, GDPR delete) and
// prints PASS/FAIL per rule. Exits non-zero on any failure.
//
// Runs against a dev server in devCode mode (no RESEND_API_KEY) that trusts
// X-Forwarded-For, on a throwaway DB — never production:
//   TRUSTED_PROXY_HOPS=1 MONGODB_URL=... MONGODB_DB=... npm run dev
//   BASE=http://localhost:3000 MONGODB_URL=... MONGODB_DB=... npm run prelaunch
import { MongoClient } from "mongodb";

const B = process.env.BASE ?? "http://localhost:3000";
if (!process.env.MONGODB_URL || !process.env.MONGODB_DB) {
  console.error("Set MONGODB_URL and MONGODB_DB to the same throwaway DB the dev server uses.");
  process.exit(2);
}
const mongo = await MongoClient.connect(process.env.MONGODB_URL);
// The dev server appends "_dev" to MONGODB_DB (src/lib/mongodb.ts); match it.
const DB = process.env.MONGODB_DB.endsWith("_dev") ? process.env.MONGODB_DB : `${process.env.MONGODB_DB}_dev`;
const db = mongo.db(DB);

let ipN = 1;
const ip = () => `100.64.${(ipN >> 8) & 255}.${ipN++ & 255}`;
const results = [];
const check = (step, name, ok, detail = "") => {
  results.push({ step, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  [${step}] ${name}${detail ? "  — " + detail : ""}`);
};

async function req(path, { method = "GET", body, cookie, xff = ip(), headers = {} } = {}) {
  const r = await fetch(B + path, {
    method,
    redirect: "manual",
    headers: { "x-forwarded-for": xff, origin: B, ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
const signIn = (email, extra = {}, xff) => req("/api/auth/sign-in", { method: "POST", body: { email, ...extra }, xff });
const verify = (email, code, xff) => req("/api/auth/verify", { method: "POST", body: { email, code, age_confirmed: true }, xff });
const uniq = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
async function newUser(prefix = "u", username) {
  const email = `${uniq(prefix)}@example.com`;
  const xff = ip();
  const s = await signIn(email, username ? { username } : {}, xff);
  const v = await verify(email, s.json?.devCode, xff);
  if (!v.cookie) throw new Error(`newUser failed ${s.status} ${s.text} / ${v.status} ${v.text}`);
  return { email, cookie: v.cookie, handle: v.json.user.handle, id: v.json.user.id, xff };
}
const wrong = (c) => String((Number(c) + 1) % 1_000_000).padStart(6, "0");

// ---------------- Step 1: login & accounts ----------------
{
  const email = `${uniq("otp")}@example.com`;
  const a = await signIn(email);
  check(1, "request-code responds 'sent' (code only in dev mode)", a.status === 200 && a.json?.sent === true);
  for (let i = 0; i < 5; i++) await verify(email, wrong(a.json.devCode));
  const after = await verify(email, a.json.devCode);
  check(1, "code dies after 5 wrong tries, even the right one", after.status === 401, after.json?.error);
}
{
  const email = `${uniq("otp")}@example.com`;
  await signIn(email);
  // 40 parallel guesses from 40 IPs: attempt cap must hold across IPs
  const guesses = await Promise.all(Array.from({ length: 40 }, (_, i) => verify(email, String(100000 + i))));
  // "N tries left" is only ever returned for a guess that was actually compared.
  const evaluated = guesses.filter((g) => /tries left/.test(g.json?.error ?? "")).length;
  check(1, "attempt cap holds against 40 parallel guesses from 40 IPs", evaluated <= 4, `${evaluated} compared with tries left (cap 5 incl. the last)`);
}
{
  const email = `${uniq("otp")}@example.com`;
  const a = await signIn(email);
  const ok1 = await verify(email, a.json.devCode);
  const again = await verify(email, a.json.devCode);
  check(1, "code works once only", ok1.status === 200 && again.status === 401);
}
{
  const email = `${uniq("otp")}@example.com`;
  const a = await signIn(email);
  const b = await signIn(email);
  const old = await verify(email, a.json.devCode);
  const neu = await verify(email, b.json.devCode);
  check(1, "resend invalidates the older code", (a.json.devCode === b.json.devCode || old.status === 401) && neu.status === 200);
}
{
  const alice = `${uniq("alice")}@example.com`, bob = `${uniq("bob")}@example.com`;
  const a = await signIn(alice);
  await signIn(bob);
  const cross = await verify(bob, a.json.devCode);
  check(1, "alice's code can't sign in bob", cross.status === 401);
}
{
  const email = `${uniq("otp")}@example.com`;
  const a = await signIn(email);
  const rec = await db.collection("auth_codes").find().sort({ createdAt: -1 }).limit(1).next();
  await db.collection("auth_codes").updateOne({ _id: rec._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const v = await verify(email, a.json.devCode);
  check(1, "expired code is rejected", v.status === 401 && /expired/i.test(v.json?.error ?? ""), v.json?.error);
  const stored = await db.collection("auth_codes").findOne({}, { sort: { createdAt: -1 } });
  check(1, "codes stored hashed, never plain", !stored || (!("code" in stored) && /^[0-9a-f]{64}$/.test(stored.codeHash ?? "")));
}
{
  const email = `${uniq("lim")}@example.com`;
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await signIn(email)).status);
  check(1, "resends capped per email (5/hour)", codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429, codes.join(","));
}
{
  const u = await newUser("enum", uniq("taken").slice(0, 20));
  const takenHandle = u.handle.replace(/^@/, "");
  const existing = await newUser("enum2");
  const rExisting = await signIn(existing.email, { username: takenHandle });
  const rNew = await signIn(`${uniq("nobody")}@example.com`, { username: takenHandle });
  check(1, "no account enumeration via taken username", rExisting.status === rNew.status, `existing=${rExisting.status} new=${rNew.status}`);
  const plainExisting = await signIn(existing.email);
  const plainNew = await signIn(`${uniq("nobody")}@example.com`);
  const shape = (r) => JSON.stringify(Object.keys(r.json ?? {}).sort()) + r.status + (r.json?.message ?? "");
  check(1, "same response for existing and new emails", shape(plainExisting) === shape(plainNew));
}
{
  const base = uniq("case");
  const u = await newUser(base);
  const email2 = `  ${u.email.toUpperCase()}  `;
  const s = await signIn(email2.trim().toUpperCase());
  const v = await verify(email2, s.json?.devCode);
  check(1, "email is case/space-insensitive (same account)", v.json?.user?.id === u.id);
}
{
  const u = await newUser("out");
  await req("/api/auth/sign-out", { method: "POST", cookie: u.cookie });
  const after = await req("/api/posts", { cookie: u.cookie });
  check(1, "sign-out kills the session server-side (old cookie dead)", after.status === 401);
  const guestPage = await req("/app");
  check(1, "logged-out user typing /app is sent to sign-in", guestPage.status === 307 && /sign-in/.test(guestPage.text + (guestPage.status)), `status ${guestPage.status}`);
}

// ---------------- Step 2: profiles ----------------
{
  const reserved = await signIn(`${uniq("r")}@example.com`, { username: "admin" });
  const brand = await signIn(`${uniq("r")}@example.com`, { username: "aithoughts_support" });
  check(2, "reserved usernames blocked", reserved.status === 400 && brand.status === 400, `${reserved.status}/${brand.status}`);
  const want = uniq("race").slice(0, 18);
  const flows = await Promise.all(Array.from({ length: 8 }, async () => {
    const email = `${uniq("race")}@example.com`, xff = ip();
    const s = await signIn(email, { username: want }, xff);
    return { email, code: s.json?.devCode, xff };
  }));
  await Promise.all(flows.filter((f) => f.code).map((f) => verify(f.email, f.code, f.xff)));
  const owners = await db.collection("users").countDocuments({ handle: `@${want}` });
  check(2, "8 simultaneous sign-ups for one username → exactly one owner", owners === 1, `${owners} owners`);
}

// ---------------- Step 3: text posts ----------------
const A = await newUser("poster");
const Bu = await newUser("other");
await db.collection("users").updateMany({ handle: { $in: [A.handle, Bu.handle] } }, { $set: { createdAt: new Date(Date.now() - 30 * 864e5).toISOString() } });
const post = (u, content, extra = {}) => req("/api/posts", { method: "POST", body: { content, media_type: "text", ...extra }, cookie: u.cookie, xff: u.xff });
{
  const empty = await post(A, "   ");
  const over = await post(A, "x".repeat(501));
  check(3, "empty and over-limit posts rejected", empty.status === 400 && over.status === 400, `${empty.status}/${over.status}`);
  const rich = "Feeling hopeful today 🌱✨ مرحبا بالعالم #hope @" + Bu.handle.replace(/^@/, "") + " https://example.com";
  const r = await post(A, rich);
  const got = r.json?.id ? await req(`/api/posts/${r.json.id}`, { cookie: A.cookie }) : null;
  check(3, "emoji + Arabic RTL + hashtag + mention + link round-trip intact", r.status === 200 && got?.json && JSON.stringify(got.json).includes("مرحبا بالعالم"), `status ${r.status} ${r.json?.error ?? ""}`);
  await new Promise((res) => setTimeout(res, 16_000)); // established-account cooldown
  const xss = "<script>alert(1)</script><img src=x onerror=alert(2)>";
  const x = await post(A, xss);
  const stored = x.json?.id ? await db.collection("posts").findOne({ content: xss }) : null;
  check(3, "<script> stored as plain text (React renders it escaped)", x.status === 200 && Boolean(stored), `status ${x.status} ${x.json?.error ?? ""}`);
}
{
  await new Promise((res) => setTimeout(res, 16_000));
  const text = "double tap " + uniq("");
  const [r1, r2] = await Promise.all([post(A, text), post(A, text)]);
  const n = await db.collection("posts").countDocuments({ content: text });
  check(3, "double-tapping Post creates one post", n === 1, `${n} created (${r1.status}/${r2.status})`);
}

// ---------------- Step 5 + 7: interactions, IDOR ----------------
const target = await db.collection("posts").findOne({ handle: A.handle }, { sort: { created_at: -1 } });
const pid = String(target._id);
{
  const likers = await Promise.all(Array.from({ length: 12 }, () => newUser("liker")));
  await Promise.all(likers.map((u) => req(`/api/posts/${pid}/reactions`, { method: "POST", body: { reaction: "❤️" }, cookie: u.cookie, xff: u.xff })));
  await Promise.all(Array.from({ length: 8 }, () => req(`/api/posts/${pid}/reactions`, { method: "POST", body: { reaction: "❤️" }, cookie: Bu.cookie, xff: Bu.xff })));
  const likes = await db.collection("reactions").countDocuments({ post_id: pid, reaction: "❤️" });
  check(5, "12 people + 1 person tapping 8× at once → like count exact", likes === 12 || likes === 13, `${likes} likes (expect 12 or 13: B's 8 taps toggle)`);
}
{
  const edit = await req(`/api/posts/${pid}`, { method: "PATCH", body: { content: "hijacked" }, cookie: Bu.cookie, xff: Bu.xff });
  const del = await req(`/api/posts/${pid}`, { method: "DELETE", cookie: Bu.cookie, xff: Bu.xff });
  check(7, "another user can't edit/delete my post by ID", edit.status === 403 && del.status === 403, `${edit.status}/${del.status}`);
  const sessions = await req("/api/account/sessions", { cookie: A.cookie });
  const sid = JSON.stringify(sessions.json).match(/"(?:sid|id)":"([^"]+)"/)?.[1];
  const endOther = sid ? await req("/api/account/sessions", { method: "POST", body: { action: "revoke", sid }, cookie: Bu.cookie, xff: Bu.xff }) : null;
  const stillIn = await req("/api/posts", { cookie: A.cookie });
  check(7, "another user can't end my sessions", stillIn.status === 200, `end attempt ${endOther?.status}`);
  const admin = await req("/api/admin/controls", { method: "POST", body: { action: "delete_post", postId: pid }, cookie: Bu.cookie, xff: Bu.xff });
  check(7, "admin actions refused for normal users", admin.status === 401 || admin.status === 403, `${admin.status}`);
}

// ---------------- Step 6: search, blocks ----------------
{
  const guest = await req(`/api/search?q=hope`);
  check(6, "guests can't read posts through search", guest.status === 401, `${guest.status}`);
  const found = await req(`/api/search?q=${encodeURIComponent(A.handle.replace(/^@/, ""))}`, { cookie: Bu.cookie, xff: Bu.xff });
  check(6, "search finds users", JSON.stringify(found.json ?? {}).includes(A.handle), `${found.status}`);
  const none = await req(`/api/search?q=zzqxnothing`, { cookie: Bu.cookie, xff: Bu.xff });
  check(6, "search with no results is a clean empty answer", none.status === 200);
  await req("/api/blocks", { method: "POST", body: { handle: Bu.handle, action: "block" }, cookie: A.cookie, xff: A.xff });
  const direct = await req(`/api/posts/${pid}`, { cookie: Bu.cookie, xff: Bu.xff });
  const s2 = await req(`/api/search?q=${encodeURIComponent(A.handle.replace(/^@/, ""))}`, { cookie: Bu.cookie, xff: Bu.xff });
  check(6, "blocked user can't open my post by direct link or find me in search", direct.status === 404 && !JSON.stringify(s2.json ?? {}).includes(A.handle), `direct ${direct.status}`);
}
{
  const F = await newUser("follower");
  const targets = await Promise.all(Array.from({ length: 61 }, () => newUser("ft")));
  const codes = [];
  for (const t of targets) codes.push((await req("/api/follows", { method: "POST", body: { handle: t.handle }, cookie: F.cookie, xff: ip() })).status);
  check(7, "follow spam capped per account even across IPs", codes.includes(429) && codes.indexOf(429) >= 55, `first 429 at #${codes.indexOf(429) + 1}`);
}

// ---------------- Step 3 (delete everywhere) ----------------
{
  const C = await newUser("deleter");
  await db.collection("users").updateOne({ handle: C.handle }, { $set: { createdAt: new Date(Date.now() - 30 * 864e5).toISOString() } });
  const word = uniq("vanish");
  const r = await post(C, `this will ${word}`);
  const id = r.json?.id;
  await req(`/api/posts/${id}/messages`, { method: "POST", body: { body: "reply" }, cookie: Bu.cookie, xff: Bu.xff });
  await req(`/api/posts/${id}`, { method: "DELETE", cookie: C.cookie, xff: C.xff });
  const link = await req(`/api/posts/${id}`, { cookie: Bu.cookie, xff: Bu.xff });
  const search = await req(`/api/search?q=${word}`, { cookie: Bu.cookie, xff: Bu.xff });
  const leftovers = (await db.collection("messages").countDocuments({ post_id: id })) + (await db.collection("notifications").countDocuments({ post_id: id }));
  check(3, "deleted post gone from link, search, replies, notifications", link.status === 404 && !JSON.stringify(search.json?.posts ?? []).includes(word) && leftovers === 0, `link ${link.status}, leftovers ${leftovers}`);
}

// ---------------- Step 11: export + delete account ----------------
{
  const D = await newUser("gdpr");
  await req("/api/mood", { method: "POST", body: { feelings: ["calm"], day: new Date().toISOString().slice(0, 10) }, cookie: D.cookie, xff: D.xff });
  await req("/api/blocks", { method: "POST", body: { handle: A.handle, action: "block" }, cookie: D.cookie, xff: D.xff });
  const exp = await req("/api/account", { cookie: D.cookie, xff: D.xff });
  check(11, "data export downloads (incl. moods/blocks)", exp.status === 200 && "moods" in (exp.json ?? {}) && "blocked" in (exp.json ?? {}));
  const del = await req("/api/account", { method: "DELETE", body: { confirm: "DELETE" }, cookie: D.cookie, xff: D.xff });
  const norm = D.handle.replace(/^@/, "").toLowerCase();
  const left = {
    users: await db.collection("users").countDocuments({ handle: D.handle }),
    moods: await db.collection("moods").countDocuments({ handle_norm: norm }),
    blocks: await db.collection("blocks").countDocuments({ blocker: D.handle }),
    sessions: await db.collection("sessions").countDocuments({ user_id: D.id }),
  };
  const after = await req("/api/posts", { cookie: D.cookie, xff: D.xff });
  check(11, "account delete removes personal data and kills the session", del.status === 200 && Object.values(left).every((n) => n === 0) && after.status === 401, JSON.stringify(left));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await mongo.close();
process.exit(failed.length ? 1 : 0);
