import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { MongoClient } from "mongodb";

// SECURITY_AUDIT.md H2: blocks and mutes are between accounts, so renaming
// either side must not lift them — and whoever later registers a renamed-away
// handle must not inherit them. Same account setup as api-blocking.spec.ts.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const MONGO_URL =
  process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";
// The dev server (NODE_ENV=development) uses "<db>_dev" — dbName() in src/lib/mongodb.ts.
const MONGO_DB = ((b) => (b.endsWith("_dev") ? b : `${b}_dev`))(process.env.MONGODB_DB ?? "aithoughts-e2e");
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

type U = { api: APIRequestContext; handle: string; postId: string };
let ipSeq = 0;
const nextIp = () => `10.82.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;

async function newUser(label: string): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
  });
  const email = `e2e-ren-${label}-${uniq()}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  // A profiles row, so "profile is hidden" can't pass vacuously.
  expect((await api.put("/api/account/privacy", { data: { privacy: "public" } })).ok()).toBeTruthy();
  const res = await api.post("/api/posts", {
    data: { content: `e2e rename relations probe ${label} ${uniq()}`, media_type: "text" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return { api, handle: user.handle as string, postId: (await res.json()).id as string };
}

async function rename(u: U, to = `rn_${uniq()}`) {
  const res = await u.api.put("/api/profile", { data: { author: "Rename test", handle: to } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const old = u.handle;
  u.handle = (await res.json()).user.handle;
  return old;
}

const act = (from: U, to: U, path: "/api/blocks" | "/api/mutes", action: string) =>
  from.api.post(path, { data: { handle: to.handle, action } });
const status = (v: U, path: string) => v.api.get(path).then((r) => r.status());
const profile = async (v: U, owner: string) =>
  (await (await v.api.get(`/api/profile?handle=${encodeURIComponent(owner)}`)).json()).profile;
const postsBy = async (v: U, owner: string): Promise<string[]> => {
  const body = await (await v.api.get(`/api/posts?handle=${encodeURIComponent(owner)}`)).json();
  return (Array.isArray(body) ? body : body.posts ?? []).map((p: { id: string }) => p.id);
};
const listed = async (v: U, path: "/api/blocks" | "/api/mutes", key: "blocked" | "muted") =>
  ((await (await v.api.get(path)).json())[key] as { handle: string }[]).map((p) => norm(p.handle));

/** Both sides can't see each other at all. */
async function expectBlocked(a: U, b: U) {
  expect(await status(b, `/api/posts/${a.postId}`)).toBe(404);
  expect(await status(a, `/api/posts/${b.postId}`)).toBe(404);
  expect(await profile(b, a.handle)).toBeNull();
  expect(await profile(a, b.handle)).toBeNull();
  const reply = await b.api.post(`/api/posts/${a.postId}/messages`, { data: { body: "still here?" } });
  expect(reply.status(), "a blocked user must not reply").toBe(404);
}

let mongo: MongoClient;

test.beforeAll(async () => {
  mongo = new MongoClient(MONGO_URL, { tls: true });
  await mongo.connect();
});
test.afterAll(async () => {
  await mongo?.close();
});

test("a block survives the blocked user renaming", async () => {
  const a = await newUser("a1");
  const b = await newUser("b1");
  expect((await act(a, b, "/api/blocks", "block")).ok()).toBeTruthy();
  await rename(b);
  await expectBlocked(a, b);
  expect(await listed(a, "/api/blocks", "blocked")).toEqual([norm(b.handle)]);
});

test("a block survives the blocker renaming", async () => {
  const a = await newUser("a2");
  const b = await newUser("b2");
  expect((await act(a, b, "/api/blocks", "block")).ok()).toBeTruthy();
  await rename(a);
  await expectBlocked(a, b);
  // And it can still be lifted after the rename.
  expect((await act(a, b, "/api/blocks", "unblock")).ok()).toBeTruthy();
  expect(await status(b, `/api/posts/${a.postId}`)).toBe(200);
});

test("a mute survives the muted user renaming", async () => {
  const a = await newUser("a3");
  const b = await newUser("b3");
  expect(await postsBy(a, b.handle)).toContain(b.postId);
  expect((await act(a, b, "/api/mutes", "mute")).ok()).toBeTruthy();
  await rename(b);
  expect(await postsBy(a, b.handle)).not.toContain(b.postId);
  expect(await listed(a, "/api/mutes", "muted")).toEqual([norm(b.handle)]);
});

test("whoever takes a blocked user's old handle is not blocked", async () => {
  const a = await newUser("a4");
  const b = await newUser("b4");
  expect((await act(a, b, "/api/blocks", "block")).ok()).toBeTruthy();
  const old = await rename(b);
  // Jump past the 90-day hold (test DB only), then someone else takes the name.
  await mongo
    .db(MONGO_DB)
    .collection("reserved_handles")
    .updateOne({ handle_norm: norm(old) }, { $set: { reserved_until: new Date(Date.now() - 1000) } });
  const c = await newUser("c4");
  await rename(c, norm(old));
  expect(await status(c, `/api/posts/${a.postId}`)).toBe(200);
  expect(await profile(c, a.handle)).not.toBeNull();
  await expectBlocked(a, b); // and the real B is still blocked
});
