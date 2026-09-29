import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

// "Your activity": a private, read-only history of what the signed-in user did
// (takes, replies, likes, reposts, saves, follows), derived from existing data.
// Previews of OTHER people's takes must respect what the user can still see.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");

type U = { api: APIRequestContext; handle: string; postId: string; content: string };
let U1: U, V: U;

async function newUser(label: string, ip: string): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip },
  });
  const email = `e2e-act-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const content = `e2e activity probe ${label} ${Date.now()}`;
  const res = await api.post("/api/posts", { data: { content, media_type: "text" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return { api, handle: (await verify.json()).user.handle, postId: (await res.json()).id, content };
}

type Item = { type: string; at: string; post_id?: string; preview?: string; handle?: string };
const items = async (u: U, q = ""): Promise<Item[]> =>
  (await (await u.api.get(`/api/account/activity${q}`)).json()).items;

test.beforeAll(async () => {
  U1 = await newUser("u", "10.83.0.1");
  V = await newUser("v", "10.83.0.2");

  const ok = async (p: Promise<{ ok(): boolean; text(): Promise<string> }>) => {
    const r = await p;
    expect(r.ok(), await r.text()).toBeTruthy();
  };
  await ok(U1.api.post(`/api/posts/${U1.postId}/messages`, { data: { body: "replying to myself" } }));
  await ok(U1.api.post(`/api/posts/${V.postId}/reactions`, { data: { reaction: "❤️" } }));
  await ok(U1.api.post(`/api/posts/${V.postId}/reactions`, { data: { reaction: "🔁" } }));
  await ok(U1.api.post("/api/follows", { data: { handle: V.handle, action: "follow" } }));
});

test.afterAll(async () => {
  await Promise.all([U1, V].map((u) => u?.api.dispose()));
});

test("activity lists the user's own actions, newest first", async () => {
  const all = await items(U1);
  const types = new Set(all.map((i) => i.type));
  for (const t of ["post", "reply", "like", "repost", "follow"]) expect(types, t).toContain(t);

  const times = all.map((i) => Date.parse(i.at));
  expect(times).toEqual([...times].sort((a, b) => b - a));

  const post = all.find((i) => i.type === "post")!;
  expect(post).toMatchObject({ post_id: U1.postId, preview: U1.content });
  expect(all.find((i) => i.type === "follow")!.handle).toBeTruthy();
  expect(norm(all.find((i) => i.type === "follow")!.handle!)).toBe(norm(V.handle));
});

test("activity can be filtered by group", async () => {
  expect((await items(U1, "?type=follows")).every((i) => i.type.startsWith("follow"))).toBe(true);
  expect((await items(U1, "?type=replies")).map((i) => i.type)).toEqual(["reply"]);
  const reactions = (await items(U1, "?type=reactions")).map((i) => i.type).sort();
  expect(reactions).toEqual(["like", "repost"]);
});

test("activity is private to its owner", async () => {
  const theirs = await items(V);
  expect(theirs.map((i) => i.post_id)).not.toContain(U1.postId);
  expect(theirs.some((i) => i.type === "reply" || i.type === "like")).toBe(false);
});

test("a like on a take you can no longer see keeps the entry but drops the preview", async () => {
  const like = async () => (await items(U1, "?type=reactions")).find((i) => i.type === "like")!;
  expect((await like()).preview).toBe(V.content); // control: visible now

  expect((await V.api.post(`/api/posts/${V.postId}/archive`, { data: { archived: true } })).ok()).toBeTruthy();
  const after = await like();
  expect(after.post_id).toBe(V.postId);
  expect(after.preview).toBeUndefined();

  await V.api.post(`/api/posts/${V.postId}/archive`, { data: { archived: false } });
});
