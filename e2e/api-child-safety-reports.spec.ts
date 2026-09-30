import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { MongoClient, ObjectId } from "mongodb";

// SECURITY_AUDIT.md M3: child-safety reports are always queued first, but a
// take is hidden at once only on a trusted reporter's word, or after enough
// independent reports. Rejected reports cost trust. Account ages are set in
// the *test* database — the only way to have a week-old account in a test run.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-test-cron-secret";
const MONGO_URL =
  process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";
// The dev server (NODE_ENV=development) uses "<db>_dev" — dbName() in src/lib/mongodb.ts.
const MONGO_DB = ((b) => (b.endsWith("_dev") ? b : `${b}_dev`))(process.env.MONGODB_DB ?? "aithoughts-e2e");
const CS = "Child safety";
const DAY = 864e5;
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let ipSeq = 0;
const nextIp = () => `10.85.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;

type U = { api: APIRequestContext; handle: string; id: string };
let mongo: MongoClient;
const db = () => mongo.db(MONGO_DB);

async function newUser(label: string, ageDays = 0): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
  });
  const email = `e2e-cs-${label}-${uniq()}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  if (ageDays) {
    await db()
      .collection("users")
      .updateOne({ _id: new ObjectId(user.id) }, { $set: { createdAt: new Date(Date.now() - ageDays * DAY).toISOString() } });
  }
  return { api, handle: user.handle, id: user.id };
}

/** A fresh public take by a fresh author. */
async function newTake(): Promise<string> {
  const author = await newUser("author");
  expect((await author.api.put("/api/account/privacy", { data: { privacy: "public" } })).ok()).toBeTruthy();
  const res = await author.api.post("/api/posts", { data: { content: `e2e cs probe ${uniq()}`, media_type: "text" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).id;
}

const report = (u: U, postId: string) =>
  u.api.post("/api/reports", { data: { target_type: "post", target_id: postId, reason: CS } });
const hidden = async (postId: string) =>
  (await db().collection("posts").findOne({ _id: new ObjectId(postId) }, { projection: { moderation_hold: 1 } }))
    ?.moderation_hold === true;

let keeper: U;
type QueueRow = {
  id: string;
  priority?: string;
  post_held?: boolean;
  reporter_standing?: { low_trust: boolean; rejected_90d: number; upheld: number } | null;
};
/** The open child-safety report on this take, as keepers see it. */
const queueRow = async (postId: string) =>
  ((await (await keeper.api.get("/api/reports")).json()) as (QueueRow & { post_id: string; reason: string })[]).find(
    (r) => r.post_id === postId && r.reason === CS
  );

test.beforeAll(async () => {
  mongo = new MongoClient(MONGO_URL, { tls: true });
  await mongo.connect();
  keeper = await newUser("keeper");
  const bs = await keeper.api.post("/api/admin/controls", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    data: { action: "bootstrap", handle: keeper.handle },
  });
  expect(bs.ok(), await bs.text()).toBeTruthy();
});
test.afterAll(async () => {
  await mongo?.close();
});

test("one report from a new account queues at top priority but doesn't hide the take", async () => {
  const post = await newTake();
  const fresh = await newUser("fresh");
  expect((await report(fresh, post)).ok()).toBeTruthy();
  expect(await hidden(post)).toBe(false);
  const row = await queueRow(post);
  expect(row?.priority).toBe("high");
  expect(row?.post_held).toBe(false);
});

test("a trusted reporter (7+ days, clean record) hides it at once", async () => {
  const post = await newTake();
  const trusted = await newUser("trusted", 8);
  expect((await report(trusted, post)).ok()).toBeTruthy();
  expect(await hidden(post)).toBe(true);
});

test("two reporters a day old, or three of any age, hide it", async () => {
  const a = await newTake();
  for (const [i, u] of [await newUser("d1", 2), await newUser("d2", 2)].entries()) {
    expect((await report(u, a)).ok()).toBeTruthy();
    expect(await hidden(a)).toBe(i === 1);
  }
  const b = await newTake();
  for (const [i, u] of [await newUser("n1"), await newUser("n2"), await newUser("n3")].entries()) {
    expect((await report(u, b)).ok()).toBeTruthy();
    expect(await hidden(b)).toBe(i === 2);
  }
});

test("each account may file 5 child-safety reports a day", async () => {
  const post = await newTake();
  const eager = await newUser("eager");
  for (let i = 0; i < 5; i++) expect((await report(eager, post)).ok()).toBeTruthy();
  expect((await report(eager, post)).status()).toBe(429);
});

test("rejected reports cost trust; upheld ones are credited", async () => {
  const reporter = await newUser("reporter", 30);
  const resolve = async (postId: string, action: string) => {
    const row = await queueRow(postId);
    expect(row, "report should be queued").toBeTruthy();
    expect((await keeper.api.post(`/api/reports/${row!.id}?action=${action}`)).ok()).toBeTruthy();
  };

  // Upheld: the keeper removes the take.
  const bad = await newTake();
  expect((await report(reporter, bad)).ok()).toBeTruthy();
  await resolve(bad, "remove_post");

  // Two rejected: after these, this reporter can no longer hide alone.
  for (let i = 0; i < 2; i++) {
    const p = await newTake();
    expect((await report(reporter, p)).ok()).toBeTruthy();
    expect(await hidden(p)).toBe(true);
    await resolve(p, "resolve");
  }
  const next = await newTake();
  expect((await report(reporter, next)).ok()).toBeTruthy();
  expect(await hidden(next), "two recent rejections: no longer trusted to hide alone").toBe(false);
  await resolve(next, "resolve");

  // Three rejections: low-trust, shown to keepers and listed for admins.
  const last = await newTake();
  expect((await report(reporter, last)).ok()).toBeTruthy();
  const row = await queueRow(last);
  expect(row?.reporter_standing).toEqual({ upheld: 1, rejected_90d: 3, low_trust: true });
  const admin = await (await keeper.api.get("/api/admin/controls")).json();
  expect(admin.lowTrustReporters.map((r: { handle: string }) => r.handle)).toContain(reporter.handle);
});
