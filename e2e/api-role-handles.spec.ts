import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { MongoClient } from "mongodb";

// SECURITY_AUDIT.md H1: keeper/admin powers belong to the account, not the
// handle. Renaming keeps them; nobody who later registers the old handle
// (after its 90-day hold) gets them; deleting an account removes them; and
// /api/keepers can't be used to probe other people.
//
// The hold is shortened by editing the *test* database directly — that is the
// only way to reach "after the cooldown" inside a test run.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-test-cron-secret";
const MONGO_URL =
  process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";
// The dev server (NODE_ENV=development) uses "<db>_dev" — dbName() in src/lib/mongodb.ts.
const MONGO_DB = ((b) => (b.endsWith("_dev") ? b : `${b}_dev`))(process.env.MONGODB_DB ?? "aithoughts-e2e");
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

type U = { api: APIRequestContext; handle: string; id: string };
let ipSeq = 0;
const nextIp = () => `10.81.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;

async function signUp(label: string, username?: string): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
  });
  const email = `e2e-role-${label}-${uniq()}@example.com`;
  const start = await api.post("/api/auth/sign-in", { data: { email, ...(username ? { username } : {}) } });
  expect(start.ok(), await start.text()).toBeTruthy();
  const { devCode } = await start.json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  return { api, handle: user.handle as string, id: user.id as string };
}

/** Starting a sign-up with `username`; 409 means "taken" (or held). */
async function signUpStatus(username: string): Promise<number> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
  });
  const res = await api.post("/api/auth/sign-in", {
    data: { email: `e2e-role-probe-${uniq()}@example.com`, username },
  });
  return res.status();
}

async function rename(u: U, to: string) {
  const res = await u.api.put("/api/profile", { data: { author: "Role test", handle: to } });
  if (res.ok()) u.handle = (await res.json()).user.handle;
  return res.status();
}

const bootstrapAdmin = (u: U) =>
  u.api.post("/api/admin/controls", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    data: { action: "bootstrap", handle: u.handle },
  });
const addKeeper = (admin: U, handle: string) =>
  admin.api.post("/api/admin/controls", { data: { action: "add_keeper", handle } });

async function powers(u: U) {
  const [keepers, reports, contact, adminMe] = await Promise.all([
    u.api.get("/api/keepers").then(async (r) => (await r.json()).isKeeper as boolean),
    u.api.get("/api/reports").then((r) => r.status()),
    u.api.get("/api/contact").then((r) => r.status()),
    u.api.get("/api/admin/me").then((r) => r.status()),
  ]);
  return { keeper: keepers, reports, contact, adminMe };
}
const NONE = { keeper: false, reports: 403, contact: 403, adminMe: 403 };

let mongo: MongoClient;
const db = () => mongo.db(MONGO_DB);
/** Jump past the cooldown for one handle (test DB only). */
async function expireHold(handle: string) {
  const res = await db()
    .collection("reserved_handles")
    .updateOne({ handle_norm: norm(handle) }, { $set: { reserved_until: new Date(Date.now() - 1000) } });
  expect(res.matchedCount, `a hold should exist for ${handle}`).toBe(1);
}

let admin: U;

test.beforeAll(async () => {
  mongo = new MongoClient(MONGO_URL, { tls: true });
  await mongo.connect();
  admin = await signUp("admin");
  const bs = await bootstrapAdmin(admin);
  expect(bs.ok(), await bs.text()).toBeTruthy();
});

test.afterAll(async () => {
  await mongo?.close();
});

test("a keeper keeps powers across a rename; whoever takes the old handle gets none", async () => {
  const keeper = await signUp("keeper", `rk_${uniq()}`);
  const oldHandle = keeper.handle;
  expect((await addKeeper(admin, oldHandle)).ok()).toBeTruthy();
  expect((await powers(keeper)).keeper).toBe(true);

  expect(await rename(keeper, `rk2_${uniq()}`)).toBe(200);
  const after = await powers(keeper);
  expect(after.keeper, "rename must not drop the role").toBe(true);
  expect(after.reports).toBe(200);
  expect(after.contact).toBe(200);

  // During the hold the old handle is taken for everyone else — sign-up and rename.
  expect(await signUpStatus(norm(oldHandle))).toBe(409);
  const attacker = await signUp("attacker");
  expect(await rename(attacker, norm(oldHandle))).toBe(409);

  // After the hold it can be registered — and carries nothing with it.
  await expireHold(oldHandle);
  expect(await rename(attacker, norm(oldHandle))).toBe(200);
  expect(norm(attacker.handle)).toBe(norm(oldHandle));
  expect(await powers(attacker)).toEqual(NONE);
  // The listing shows the keeper under their current name, not the old one.
  const list = await (await admin.api.get("/api/admin/controls")).json();
  expect(list.keepers.map(norm)).toContain(norm(keeper.handle));
  expect(list.keepers.map(norm)).not.toContain(norm(oldHandle));
});

test("the previous owner alone can reclaim a held handle", async () => {
  const u = await signUp("reclaim", `rc_${uniq()}`);
  const original = u.handle;
  expect(await rename(u, `rc2_${uniq()}`)).toBe(200);
  expect(await rename(u, norm(original))).toBe(200);
  expect(norm(u.handle)).toBe(norm(original));
  // Reclaiming releases the hold on it (and holds the name they left).
  expect(await db().collection("reserved_handles").countDocuments({ handle_norm: norm(original) })).toBe(0);
});

test("an admin keeps admin across a rename; the old handle doesn't confer it", async () => {
  const boss = await signUp("boss", `rb_${uniq()}`);
  expect((await bootstrapAdmin(boss)).ok()).toBeTruthy();
  const oldHandle = boss.handle;
  expect(await rename(boss, `rb2_${uniq()}`)).toBe(200);
  expect((await powers(boss)).adminMe).toBe(200);

  await expireHold(oldHandle);
  const attacker = await signUp("attacker2", norm(oldHandle));
  expect(norm(attacker.handle)).toBe(norm(oldHandle));
  expect(await powers(attacker)).toEqual(NONE);
});

test("deleting an account removes its roles and holds its handle", async () => {
  const gone = await signUp("gone", `rd_${uniq()}`);
  expect((await addKeeper(admin, gone.handle)).ok()).toBeTruthy();
  const handle = gone.handle;

  const del = await gone.api.delete("/api/account", { data: { confirm: "DELETE" } });
  expect(del.ok(), await del.text()).toBeTruthy();
  expect(await db().collection("keepers").countDocuments({ user_id: gone.id })).toBe(0);
  expect(await signUpStatus(norm(handle))).toBe(409);

  await expireHold(handle);
  const newcomer = await signUp("newcomer", norm(handle));
  expect(norm(newcomer.handle)).toBe(norm(handle));
  expect(await powers(newcomer)).toEqual(NONE);
});

test("/api/keepers answers only about the caller", async () => {
  const keeper = await signUp("k3");
  expect((await addKeeper(admin, keeper.handle)).ok()).toBeTruthy();
  const stranger = await signUp("stranger");
  const probe = await stranger.api.get(`/api/keepers?handle=${encodeURIComponent(keeper.handle)}`);
  expect((await probe.json()).isKeeper, "must not reveal someone else's role").toBe(false);
  // Granting to a handle nobody holds is refused, so no role waits for a registrant.
  const ghost = await addKeeper(admin, `@ghost_${uniq()}`);
  expect(ghost.status()).toBe(400);
});
