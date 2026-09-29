import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

// Account blocking (mutual invisibility). Same shape as api-privacy.spec.ts:
// three accounts signed in once and reused (sign-in is rate limited and a new
// account may post once in its first hour), each with its own X-Forwarded-For
// and an Origin header (src/proxy.ts CSRF check). Every account posts once.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const LOCKED_MSG = "This account isn't accepting followers";

type U = { api: APIRequestContext; handle: string; postId: string };
let A: U, B: U, C: U;

async function newUser(label: string, ip: string, withPost = true): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip },
  });
  const email = `e2e-blk-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  // GET /api/profile is null until a profiles row exists, which would make
  // every "profile is hidden" assertion pass vacuously. Create the row.
  const pub = await api.put("/api/account/privacy", { data: { privacy: "public" } });
  expect(pub.ok(), await pub.text()).toBeTruthy();
  if (!withPost) return { api, handle: user.handle as string, postId: "" };
  const res = await api.post("/api/posts", {
    data: { content: `e2e blocking probe ${label} ${Date.now()}`, media_type: "text" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return { api, handle: user.handle as string, postId: (await res.json()).id as string };
}

const block = (from: U, to: U, action = "block") =>
  from.api.post("/api/blocks", { data: { handle: to.handle, action } });
const follow = (from: U, to: U, action = "follow") =>
  from.api.post("/api/follows", { data: { handle: to.handle, action } });
const status = (viewer: U, path: string) => viewer.api.get(path).then((r) => r.status());
const profile = async (viewer: U, owner: U) =>
  (await (await viewer.api.get(`/api/profile?handle=${encodeURIComponent(owner.handle)}`)).json())
    .profile;
const inSearch = async (viewer: U, target: U) => {
  const q = norm(target.handle);
  const { people } = await (await viewer.api.get(`/api/people?q=${encodeURIComponent(q)}`)).json();
  return people.some((p: { handle: string }) => norm(p.handle) === q);
};

test.beforeAll(async () => {
  A = await newUser("a", "10.79.0.1");
  B = await newUser("b", "10.79.0.2");
  C = await newUser("c", "10.79.0.3");
});

test.beforeEach(async () => {
  for (const [x, y] of [[A, B], [B, A], [A, C], [C, A], [B, C], [C, B]] as const) {
    await block(x, y, "unblock");
    await follow(x, y, "unfollow");
  }
});

test.afterAll(async () => {
  await Promise.all([A, B, C].map((u) => u?.api.dispose()));
});

test.describe("account blocking: core", () => {
  test("blocking clears follows and hides everything in both directions", async () => {
    await follow(B, A);
    await follow(A, B);
    expect((await block(A, B)).ok()).toBeTruthy();

    const graph = async (v: U, o: U) =>
      (await (await v.api.get(`/api/follows?handle=${encodeURIComponent(o.handle)}`)).json())
        .followState;
    expect(await graph(B, A)).toBe("none");
    expect(await graph(A, B)).toBe("none");

    expect(await status(B, `/api/posts/${A.postId}`)).toBe(404);
    expect(await status(A, `/api/posts/${B.postId}`)).toBe(404);
    expect(await profile(B, A)).toBeNull();
    expect(await profile(A, B)).toBeNull();
    expect(await inSearch(B, A)).toBe(false);
    expect(await inSearch(A, B)).toBe(false);

    // Third parties are unaffected (and this proves the null above is the block).
    expect(await status(C, `/api/posts/${A.postId}`)).toBe(200);
    expect(await profile(C, A)).not.toBeNull();
    expect(await inSearch(C, A)).toBe(true);
  });

  test("blocking validates input and is idempotent", async () => {
    expect((await block(A, A)).status()).toBe(400);
    const ghost = await A.api.post("/api/blocks", {
      data: { handle: "@nobody-e2e-ghost", action: "block" },
    });
    expect(ghost.status()).toBe(404);
    expect((await A.api.post("/api/blocks", { data: { handle: B.handle, action: "nope" } })).status()).toBe(400);

    expect((await block(A, B)).ok()).toBeTruthy();
    expect((await block(A, B)).ok()).toBeTruthy();
    const list = await (await A.api.get("/api/blocks")).json();
    expect(list.blocked.map((p: { handle: string }) => norm(p.handle))).toEqual([norm(B.handle)]);

    await block(A, B, "unblock");
    expect((await (await A.api.get("/api/blocks")).json()).blocked).toEqual([]);
  });

  test("unblocking restores visibility but not follows", async () => {
    await follow(B, A);
    await block(A, B);
    await block(A, B, "unblock");
    expect(await status(B, `/api/posts/${A.postId}`)).toBe(200);
    expect(await profile(B, A)).not.toBeNull();
    const state = (
      await (await B.api.get(`/api/follows?handle=${encodeURIComponent(A.handle)}`)).json()
    ).followState;
    expect(state).toBe("none");
  });
});

const replies = async (viewer: U, postId: string): Promise<string[]> =>
  (await (await viewer.api.get(`/api/posts/${postId}/messages`)).json()).map(
    (m: { body: string }) => m.body
  );

test.describe("account blocking: interactions", () => {
  test("neither side can follow the other, and the error doesn't reveal the block", async () => {
    await block(A, B);
    for (const [from, to] of [[B, A], [A, B]] as const) {
      const res = await follow(from, to);
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe(LOCKED_MSG);
    }
  });

  test("a blocked user's replies vanish for the blocker only", async () => {
    const body = `reply-from-b ${Date.now()}`;
    expect(
      (await B.api.post(`/api/posts/${C.postId}/messages`, { data: { body } })).ok()
    ).toBeTruthy();
    expect(await replies(A, C.postId)).toContain(body); // control

    await block(A, B);
    expect(await replies(A, C.postId)).not.toContain(body);
    expect(await replies(C, C.postId)).toContain(body);
  });

  test("a blocked user's mention never notifies the blocker", async () => {
    const mentionsForA = async () =>
      (await (await A.api.get("/api/activity")).json()).items.filter(
        (n: { kind: string; post_id: string }) => n.kind === "mention" && n.post_id === C.postId
      ).length;
    const mention = () =>
      B.api.post(`/api/posts/${C.postId}/messages`, {
        data: { body: `hey @${norm(A.handle)} look ${Date.now()}` },
      });

    // Control: without a block the mention is delivered.
    expect((await mention()).ok()).toBeTruthy();
    expect(await mentionsForA()).toBeGreaterThan(0);

    // Blocking clears what already arrived, and nothing new gets through.
    await block(A, B);
    expect(await mentionsForA()).toBe(0);
    expect((await mention()).ok()).toBeTruthy();
    expect(await mentionsForA()).toBe(0);
  });

  test("a blocked user's name leaves the liked-by list, the count stays", async () => {
    await B.api.post(`/api/posts/${C.postId}/reactions`, { data: { reaction: "❤️" } });
    const likedBy = async (v: U) =>
      (await (await v.api.get(`/api/posts/${C.postId}`)).json()).liked_by.map(
        (p: { handle: string }) => norm(p.handle)
      );
    const likeCount = async (v: U) =>
      (await (await v.api.get(`/api/posts/${C.postId}`)).json()).like_count;
    expect(await likedBy(A)).toContain(norm(B.handle)); // control
    const before = await likeCount(A);

    await block(A, B);
    expect(await likedBy(A)).not.toContain(norm(B.handle));
    expect(await likeCount(A)).toBe(before);
    expect(await likedBy(C)).toContain(norm(B.handle));
    // Toggle back off so the shared post is clean for other tests.
    await B.api.post(`/api/posts/${C.postId}/reactions`, { data: { reaction: "❤️" } });
  });

  test("only the blocker is told about the block", async () => {
    await block(A, B);
    const flag = async (v: U, o: U) =>
      (await (await v.api.get(`/api/follows?handle=${encodeURIComponent(o.handle)}`)).json())
        .blockedByMe;
    expect(await flag(A, B)).toBe(true);
    expect(await flag(B, A)).toBeFalsy();
  });

  test("a blocked user cannot quote the blocker's public take", async () => {
    // A fresh account: B already used its one first-hour post, and the post
    // cap is checked before the quote guard.
    const D = await newUser("d", "10.79.0.4", false);
    try {
      const quote = () =>
        D.api.post("/api/posts", {
          data: { content: "quoting a public take", media_type: "text", quoted_post_id: A.postId },
        });
      await block(A, D);
      expect((await quote()).status()).toBe(403);
    } finally {
      await block(A, D, "unblock");
      await D.api.dispose();
    }
  });
});
