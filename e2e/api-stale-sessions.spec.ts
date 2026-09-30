import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { MongoClient } from "mongodb";
import { createHmac } from "node:crypto";

// SECURITY_AUDIT.md M5: a session is only as good as the account behind it.
// The handle comes from the account, not the cookie, and banned or deleted
// accounts lose access on the next request — legacy cookies included.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-test-cron-secret";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "e2e-test-secret-not-for-prod";
const MONGO_URL =
  process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";
// The dev server (NODE_ENV=development) uses "<db>_dev" — dbName() in src/lib/mongodb.ts.
const MONGO_DB = ((b) => (b.endsWith("_dev") ? b : `${b}_dev`))(process.env.MONGODB_DB ?? "aithoughts-e2e");
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let ipSeq = 0;
const nextIp = () => `10.87.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;

type Device = { api: APIRequestContext; handle: string; id: string };
let mongo: MongoClient;

const ctx = (cookie?: string) =>
  pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp(), ...(cookie ? { Cookie: cookie } : {}) },
    maxRedirects: 0,
  });

/** Sign in as `email` on a new device (its own session). */
async function device(email: string): Promise<Device> {
  const api = await ctx();
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  return { api, handle: user.handle, id: user.id };
}
const email = (label: string) => `e2e-stale-${label}-${uniq()}@example.com`;

/** A cookie as old versions minted them: no session id, so no sessions row to delete. */
function legacyCookie(u: { id: string; handle: string }): string {
  const payload = Buffer.from(
    JSON.stringify({ id: u.id, handle: u.handle, displayName: "Legacy", exp: Date.now() + 30 * 864e5 })
  ).toString("base64url");
  const sig = createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");
  return `aithoughts.session=${payload}.${sig}`;
}

const rename = async (d: Device, to = `st_${uniq()}`) => {
  const res = await d.api.put("/api/profile", { data: { author: "Stale test", handle: to } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).user.handle as string;
};
const post = async (d: Device) => {
  const res = await d.api.post("/api/posts", { data: { content: `e2e stale probe ${uniq()}`, media_type: "text" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { id: string; handle: string };
};

test.beforeAll(async () => {
  mongo = new MongoClient(MONGO_URL, { tls: true });
  await mongo.connect();
});
test.afterAll(async () => {
  await mongo?.close();
});

test("a device that missed a rename acts under the new handle", async () => {
  const e = email("renamer");
  const phone = await device(e);
  const laptop = await device(e);
  const newHandle = await rename(phone);
  const made = await post(laptop); // laptop's cookie still says the old handle
  expect(norm(made.handle)).toBe(norm(newHandle));
});

test("a stale device can't touch the take of whoever now holds its old handle", async () => {
  const e = email("oldowner");
  const phone = await device(e);
  const laptop = await device(e);
  const oldHandle = phone.handle;
  await rename(phone);
  await mongo
    .db(MONGO_DB)
    .collection("reserved_handles")
    .updateOne({ handle_norm: norm(oldHandle) }, { $set: { reserved_until: new Date(Date.now() - 1000) } });
  const newcomer = await device(email("newcomer"));
  await rename(newcomer, norm(oldHandle));
  const theirs = await post(newcomer);

  expect((await laptop.api.patch(`/api/posts/${theirs.id}`, { data: { content: "not mine" } })).status()).toBe(403);
  expect((await laptop.api.delete(`/api/posts/${theirs.id}`)).status()).toBe(403);
});

test("a banned account loses every session on the next request, legacy cookies too", async () => {
  const keeper = await device(email("keeper"));
  const bs = await keeper.api.post("/api/admin/controls", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    data: { action: "bootstrap", handle: keeper.handle },
  });
  expect(bs.ok(), await bs.text()).toBeTruthy();

  const target = await device(email("banned"));
  const legacy = await ctx(legacyCookie(target));
  expect((await target.api.get("/api/auth/me")).status()).toBe(200);
  expect((await legacy.get("/api/auth/me")).status(), "legacy cookie works before the ban").toBe(200);

  const reporter = await device(email("reporter"));
  const rep = await reporter.api.post("/api/reports", {
    data: { target_type: "user", target_id: target.handle, reason: "Spam or coordinated accounts" },
  });
  expect(rep.ok(), await rep.text()).toBeTruthy();
  const queue = (await (await keeper.api.get("/api/reports")).json()) as { id: string; reported_handle: string }[];
  const row = queue.find((r) => norm(r.reported_handle ?? "") === norm(target.handle));
  expect((await keeper.api.post(`/api/reports/${row!.id}?action=ban`)).ok()).toBeTruthy();

  expect((await target.api.get("/api/auth/me")).status()).toBe(401);
  expect((await legacy.get("/api/auth/me")).status()).toBe(401);
  const page = await target.api.get("/app");
  expect(page.status()).toBe(307);
  expect(page.headers()["location"]).toContain("/sign-in");
});

test("a deleted account's legacy cookie stops working", async () => {
  const gone = await device(email("deleted"));
  const legacy = await ctx(legacyCookie(gone));
  expect((await legacy.get("/api/auth/me")).status()).toBe(200);
  expect((await gone.api.delete("/api/account", { data: { confirm: "DELETE" } })).ok()).toBeTruthy();
  expect((await legacy.get("/api/auth/me")).status()).toBe(401);
});
