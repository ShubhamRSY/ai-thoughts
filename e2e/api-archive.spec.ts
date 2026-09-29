import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

// Archive: an author hides one of their takes from everyone (including the
// feed, profile and prompt peers) without deleting it, and can bring it back.
// Two accounts, signed in once; A's single first-hour post is the subject.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const today = () => new Date().toISOString().slice(0, 10);

type U = { api: APIRequestContext; handle: string };
let A: U, B: U;
let postId: string;

async function newUser(label: string, ip: string): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip },
  });
  const email = `e2e-arch-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return { api, handle: (await verify.json()).user.handle as string };
}

const archive = (u: U, id: string, archived: boolean) =>
  u.api.post(`/api/posts/${id}/archive`, { data: { archived } });
const status = (u: U, path: string) => u.api.get(path).then((r) => r.status());
const ids = async (u: U, path: string): Promise<string[]> =>
  (await (await u.api.get(path)).json()).map((p: { id: string }) => p.id);

test.beforeAll(async () => {
  A = await newUser("a", "10.82.0.1");
  B = await newUser("b", "10.82.0.2");
  const res = await A.api.post("/api/posts", {
    data: {
      content: `e2e archive probe ${Date.now()}`,
      media_type: "text",
      prompt_day: today(),
      from_daily_prompt: true,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  postId = (await res.json()).id;
});

test.afterAll(async () => {
  await Promise.all([A, B].map((u) => u?.api.dispose()));
});

test("only the author can archive a take", async () => {
  expect((await archive(B, postId, true)).status()).toBe(403);
  expect(await status(B, `/api/posts/${postId}`)).toBe(200); // still public
  expect((await B.api.post(`/api/posts/${postId}/archive`, { data: { archived: "yes" } })).status()).toBe(400);
});

test("an archived take disappears for everyone but its author, and comes back on unarchive", async () => {
  const byHandle = `/api/posts?handle=${encodeURIComponent(A.handle)}`;
  const peers = async () =>
    (await (await B.api.get(`/api/prompt/peers?day=${today()}`)).json()).peers.map(
      (p: { handle: string }) => norm(p.handle)
    );

  // Controls: visible everywhere before archiving.
  expect(await ids(B, byHandle)).toContain(postId);
  expect(await peers()).toContain(norm(A.handle));

  expect((await archive(A, postId, true)).ok()).toBeTruthy();

  // Gone for others, on every read and interaction path.
  expect(await ids(B, byHandle)).not.toContain(postId);
  expect(await peers()).not.toContain(norm(A.handle));
  expect(await status(B, `/api/posts/${postId}`)).toBe(404);
  expect(await status(B, `/api/posts/${postId}/messages`)).toBe(404);
  expect((await B.api.post(`/api/posts/${postId}/messages`, { data: { body: "hello there" } })).status()).toBe(404);
  expect((await B.api.post(`/api/posts/${postId}/reactions`, { data: { reaction: "❤️" } })).status()).toBe(404);
  expect((await B.api.post(`/api/posts/${postId}/view`)).status()).toBe(404);
  expect((await B.api.post(`/api/posts/${postId}/report`, { data: { reason: "Spam or coordinated accounts" } })).status()).toBe(404);
  const quote = await B.api.post("/api/posts", {
    data: { content: "quoting an archived take", media_type: "text", quoted_post_id: postId },
  });
  expect(quote.status()).toBe(403);

  // The author: not in the normal profile feed, but reachable and listed in the archive.
  expect(await ids(A, byHandle)).not.toContain(postId);
  expect(await ids(A, "/api/posts?archived=1")).toEqual([postId]);
  expect(await status(A, `/api/posts/${postId}`)).toBe(200);
  // Nobody else can list an archive that isn't theirs.
  expect(await ids(B, "/api/posts?archived=1")).toEqual([]);

  expect((await archive(A, postId, false)).ok()).toBeTruthy();
  expect(await ids(B, byHandle)).toContain(postId);
  expect(await status(B, `/api/posts/${postId}`)).toBe(200);
  expect(await ids(A, "/api/posts?archived=1")).toEqual([]);
});
