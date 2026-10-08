import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";

// SECURITY_AUDIT.md M4: per-account upload quotas and per-type caps are
// checked before any Blob call, and the daily cleanup only reports until it
// is switched on. Blob has no token in tests, so a request that passes every
// check ends at "no token" — which is how the tests see the checks ran first.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-test-cron-secret";
const MONGO_URL =
  process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";
// The dev server (NODE_ENV=development) uses "<db>_dev" — dbName() in src/lib/mongodb.ts.
const MONGO_DB = ((b) => (b.endsWith("_dev") ? b : `${b}_dev`))(process.env.MONGODB_DB ?? "aithoughts-e2e");
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let ipSeq = 0;
const nextIp = () => `10.86.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;

let mongo: MongoClient;
const uploads = () => mongo.db(MONGO_DB).collection("uploads");

async function newUser(label: string): Promise<{ api: APIRequestContext; id: string }> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
  });
  const email = `e2e-quota-${label}-${uniq()}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return { api, id: (await verify.json()).user.id };
}

const askToken = (api: APIRequestContext, pathname: string) =>
  api.post("/api/upload", {
    data: { type: "blob.generate-client-token", payload: { pathname, clientPayload: null, multipart: false } },
  });

const seedRow = (ownerId: string, kind: "take" | "avatar", createdAt: Date, attached: string | null = null) =>
  uploads().insertOne({
    key: `u:${randomUUID()}`,
    owner_id: ownerId,
    kind,
    private: false,
    created_at: createdAt,
    attached_to: attached,
  });

test.beforeAll(async () => {
  mongo = new MongoClient(MONGO_URL, { tls: true });
  await mongo.connect();
});
test.afterAll(async () => {
  await mongo?.close();
});

test("names and types outside the rules are refused before any upload", async () => {
  const { api } = await newUser("names");
  expect((await askToken(api, "take-123.webm")).status()).toBe(400);
  expect((await askToken(api, `avatar-${randomUUID()}.webm`)).status()).toBe(400);
});

test("the 11th take upload in an hour is refused; within quota the uploader is recorded first", async () => {
  const { api, id } = await newUser("quota");
  const uuid = randomUUID();
  const first = await askToken(api, `take-${uuid}.webm`);
  // Passed every check and reached Blob, which has no token in tests.
  expect(first.status()).toBe(400);
  expect(await uploads().countDocuments({ key: `u:${uuid}`, owner_id: id })).toBe(1);

  for (let i = 0; i < 9; i++) await seedRow(id, "take", new Date(Date.now() - i * 60_000));
  const over = await askToken(api, `take-${randomUUID()}.webm`);
  expect(over.status()).toBe(429);
  expect((await over.json()).retry_in_sec).toBeGreaterThan(0);
  // Avatars have their own allowance.
  expect((await askToken(api, `avatar-${randomUUID()}.jpg`)).status()).toBe(400);
});

test("a full storage budget refuses new takes but deletes nothing", async () => {
  const { api, id } = await newUser("storage");
  const GB = 1024 ** 3;
  // Two attached takes totalling the 2 GB budget, plus an old row with no size.
  const a = await uploads().insertOne({ key: `u:${randomUUID()}`, owner_id: id, kind: "take", private: false, created_at: new Date(Date.now() - 3 * 24 * 3600e3), attached_to: "post-a", size: GB });
  const b = await uploads().insertOne({ key: `u:${randomUUID()}`, owner_id: id, kind: "take", private: false, created_at: new Date(Date.now() - 3 * 24 * 3600e3), attached_to: "post-b", size: GB });
  await seedRow(id, "take", new Date(Date.now() - 3 * 24 * 3600e3), "post-legacy");

  const full = await askToken(api, `take-${randomUUID()}.webm`);
  expect(full.status()).toBe(413);
  expect((await full.json()).code).toBe("storage_full");
  // Avatars aren't part of the budget.
  expect((await askToken(api, `avatar-${randomUUID()}.jpg`)).status()).toBe(400);
  expect(await uploads().countDocuments({ owner_id: id, kind: "take" })).toBe(3);

  // Deleting a take frees its space.
  await uploads().deleteOne({ _id: b.insertedId });
  expect((await askToken(api, `take-${randomUUID()}.webm`)).status()).toBe(400);
  expect(await uploads().countDocuments({ _id: a.insertedId })).toBe(1);
});

test("the cleanup job only reports until it's switched on", async () => {
  const { id } = await newUser("cleanup");
  // Start from a clean slate of stale rows in the test database.
  await uploads().deleteMany({ attached_to: null, created_at: { $lt: new Date(Date.now() - 24 * 3600e3) } });
  const stale = await seedRow(id, "take", new Date(Date.now() - 2 * 24 * 3600e3));
  const fresh = await seedRow(id, "take", new Date(Date.now() - 3600e3));
  const used = await seedRow(id, "take", new Date(Date.now() - 2 * 24 * 3600e3), "some-post");

  const api = await pwRequest.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { "X-Forwarded-For": nextIp() } });
  const denied = await api.get("/api/cron/cleanup-uploads");
  expect(denied.status()).toBe(401);
  const res = await api.get("/api/cron/cleanup-uploads", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  expect(body.dryRun).toBe(true);
  const keys = body.sample.map((s: { key: string }) => s.key);
  const keyOf = async (r: { insertedId: unknown }) => (await uploads().findOne({ _id: r.insertedId as never }))!.key;
  expect(keys).toContain(await keyOf(stale));
  expect(keys).not.toContain(await keyOf(fresh));
  expect(keys).not.toContain(await keyOf(used));
  // Nothing was removed.
  expect(await uploads().countDocuments({ _id: stale.insertedId })).toBe(1);
});
