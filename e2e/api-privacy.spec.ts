import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

// Account privacy (public / private / locked).
//
// Three accounts are signed in once and reused (A owns the content, B and C
// are other people); reset() puts the relationships back between tests. That's
// deliberate: sign-in is rate limited per IP and globally, and a new account
// may only post once in its first hour, so a fresh cast per test would trip
// both. Each user sends its own X-Forwarded-For (src/lib/rate-limit.ts trusts
// it, as it does behind a proxy) so they count as separate clients, and an
// Origin header like a real same-origin fetch (src/proxy.ts CSRF check).

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const today = () => new Date().toISOString().slice(0, 10);

type U = { api: APIRequestContext; handle: string };
let A: U, B: U, C: U;
let postId: string; // A's one and only post; carries today's prompt day

async function newUser(label: string, ip: string): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip },
  });
  const email = `e2e-priv-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const signIn = await api.post("/api/auth/sign-in", { data: { email } });
  const { devCode } = await signIn.json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  return { api, handle: user.handle as string };
}

const setPrivacy = async (u: U, privacy: string) => {
  const res = await u.api.put("/api/account/privacy", { data: { privacy } });
  expect(res.ok(), await res.text()).toBeTruthy();
};

const follow = (from: U, to: U, action = "follow") =>
  from.api.post("/api/follows", { data: { handle: to.handle, action } });

const state = async (viewer: U, owner: U) =>
  (await (await viewer.api.get(`/api/follows?handle=${encodeURIComponent(owner.handle)}`)).json())
    .followState;

test.beforeAll(async () => {
  [A, B, C] = [
    await newUser("a", "10.77.0.1"),
    await newUser("b", "10.77.0.2"),
    await newUser("c", "10.77.0.3"),
  ];
  const res = await A.api.post("/api/posts", {
    data: {
      content: `e2e private probe ${Date.now()}`,
      media_type: "text",
      prompt_day: today(),
      from_daily_prompt: true,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  postId = (await res.json()).id;
});

test.beforeEach(async () => {
  await setPrivacy(A, "public");
  await follow(B, A, "unfollow");
  await follow(C, A, "unfollow");
});

test.afterAll(async () => {
  await Promise.all([A, B, C].map((u) => u?.api.dispose()));
});

test.describe("account privacy: follow requests", () => {
  test("private account: follow stays pending until approved", async () => {
    await setPrivacy(A, "private");

    const res = await (await follow(B, A)).json();
    expect(res).toMatchObject({ ok: true, following: false, requested: true });
    expect(await state(B, A)).toBe("requested");

    const reqs = await (await A.api.get("/api/follows/requests")).json();
    expect(reqs.requests.map((r: { handle: string }) => norm(r.handle))).toContain(norm(B.handle));

    expect((await follow(A, B, "approve")).ok()).toBeTruthy();
    expect(await state(B, A)).toBe("following");
  });

  test("locked account rejects new follows", async () => {
    await setPrivacy(A, "locked");
    expect((await follow(B, A)).status()).toBe(400);
  });

  test("switching to public approves pending requests", async () => {
    await setPrivacy(A, "private");
    await follow(B, A);
    expect(await state(B, A)).toBe("requested");
    await setPrivacy(A, "public");
    expect(await state(B, A)).toBe("following");
  });

  test("switching to locked declines pending requests but keeps followers", async () => {
    await setPrivacy(A, "private");
    await follow(B, A);
    await follow(A, B, "approve");
    await follow(C, A);
    await setPrivacy(A, "locked");
    expect(await state(C, A)).toBe("none");
    expect(await state(B, A)).toBe("following");
  });

  test("declining removes the request", async () => {
    await setPrivacy(A, "private");
    await follow(B, A);
    await follow(A, B, "decline");
    expect(await state(B, A)).toBe("none");
  });

  test("privacy endpoint rejects unknown values", async () => {
    const res = await A.api.put("/api/account/privacy", { data: { privacy: "secret" } });
    expect(res.status()).toBe(400);
  });
});

test.describe("account privacy: posts", () => {
  test("stranger cannot read or interact with a private account's post", async () => {
    await setPrivacy(A, "private");

    const byHandle = await (
      await B.api.get(`/api/posts?handle=${encodeURIComponent(A.handle)}`)
    ).json();
    expect(byHandle).toEqual([]);
    expect((await B.api.get(`/api/posts/${postId}`)).status()).toBe(404);
    expect((await B.api.get(`/api/posts/${postId}/messages`)).status()).toBe(404);
    expect(
      (await B.api.post(`/api/posts/${postId}/messages`, { data: { body: "hello there" } })).status()
    ).toBe(404);
    expect(
      (await B.api.post(`/api/posts/${postId}/reactions`, { data: { reaction: "❤️" } })).status()
    ).toBe(404);
    expect((await B.api.post(`/api/posts/${postId}/view`)).status()).toBe(404);
    expect(
      (await B.api.post(`/api/posts/${postId}/report`, { data: { reason: "Spam or coordinated accounts" } })).status()
    ).toBe(404);

    // The author still sees it.
    const own = await (await A.api.get(`/api/posts?handle=${encodeURIComponent(A.handle)}`)).json();
    expect(own.map((p: { id: string }) => p.id)).toContain(postId);
  });

  test("approved follower gains access", async () => {
    await setPrivacy(A, "private");
    await follow(B, A);
    expect((await B.api.get(`/api/posts/${postId}`)).status()).toBe(404);
    await follow(A, B, "approve");
    expect((await B.api.get(`/api/posts/${postId}`)).status()).toBe(200);
  });

  test("locked account hides posts from strangers too", async () => {
    await setPrivacy(A, "locked");
    expect((await B.api.get(`/api/posts/${postId}`)).status()).toBe(404);
  });

  test("private takes cannot be quoted or reposted, even by an approved follower", async () => {
    await setPrivacy(A, "private");
    await follow(B, A);
    await follow(A, B, "approve");

    const quote = await B.api.post("/api/posts", {
      data: { content: "quoting this", media_type: "text", quoted_post_id: postId },
    });
    expect(quote.status()).toBe(403);
    const repost = await B.api.post(`/api/posts/${postId}/reactions`, { data: { reaction: "🔁" } });
    expect(repost.status()).toBe(403);
  });
});

test.describe("account privacy: identity and discovery", () => {
  const profile = async (viewer: U) =>
    (await (await viewer.api.get(`/api/profile?handle=${encodeURIComponent(A.handle)}`)).json())
      .profile;

  const searchable = async (viewer: U) => {
    const q = norm(A.handle);
    const { people } = await (await viewer.api.get(`/api/people?q=${encodeURIComponent(q)}`)).json();
    return people.some((p: { handle: string }) => norm(p.handle) === q);
  };

  test("private: profile shell and search stay visible, posts and lists do not", async () => {
    await setPrivacy(A, "private");
    expect(await profile(B)).toMatchObject({ privacy: "private", restricted: true });
    expect(await searchable(B)).toBe(true);

    const graph = await (
      await B.api.get(`/api/follows?handle=${encodeURIComponent(A.handle)}`)
    ).json();
    expect(graph).toMatchObject({ restricted: true, followers: [], followingProfiles: [] });
  });

  test("locked: profile and search are hidden from strangers, not from followers", async () => {
    await setPrivacy(A, "private");
    await follow(B, A);
    await follow(A, B, "approve");
    await setPrivacy(A, "locked");

    expect(await profile(C)).toBeNull();
    expect(await searchable(C)).toBe(false);

    expect(await profile(B)).toMatchObject({ privacy: "locked", restricted: false });
    expect(await searchable(B)).toBe(true);
  });

  test("prompt peers surface a public take but never a private one", async () => {
    const peers = async () =>
      (await (await B.api.get(`/api/prompt/peers?day=${today()}`)).json()).peers.map(
        (p: { handle: string }) => norm(p.handle)
      );
    expect(await peers()).toContain(norm(A.handle));
    await setPrivacy(A, "private");
    expect(await peers()).not.toContain(norm(A.handle));
  });

  test("a pending request shows as requested in people search", async () => {
    await setPrivacy(A, "private");
    await follow(B, A);
    const { people } = await (
      await B.api.get(`/api/people?q=${encodeURIComponent(norm(A.handle))}`)
    ).json();
    const row = people.find((p: { handle: string }) => norm(p.handle) === norm(A.handle));
    expect(row).toMatchObject({ following: false, requested: true });
  });
});

test.describe("account privacy: liked_by never names hidden accounts", () => {
  test("a private account's like stays anonymous to strangers but visible to followers", async () => {
    // B goes private and likes A's public post.
    await setPrivacy(B, "private");
    const like = await B.api.post(`/api/posts/${postId}/reactions`, {
      data: { reaction: "❤️" },
    });
    expect(like.ok(), await like.text()).toBeTruthy();

    const likedBy = async (viewer: U) => {
      const post = await (await viewer.api.get(`/api/posts/${postId}`)).json();
      return (post.liked_by as { handle: string }[]).map((p) => norm(p.handle));
    };

    // Neither the owner nor a stranger follows private B now, so neither may
    // learn B reacted to the post.
    expect(await likedBy(A)).not.toContain(norm(B.handle));
    expect(await likedBy(C)).not.toContain(norm(B.handle));
    // The reaction itself still counts.
    const post = await (await A.api.get(`/api/posts/${postId}`)).json();
    expect(post.like_count).toBeGreaterThan(0);

    // Once B approves C as a follower, C is allowed to see the reaction.
    await follow(C, B);
    await follow(B, C, "approve");
    expect(await likedBy(C)).toContain(norm(B.handle));

    // Leave the cast as we found it.
    await follow(C, B, "unfollow");
    await setPrivacy(B, "public");
  });
});

test.describe("account privacy: notifications", () => {
  test("a mention on a private thread never reaches someone who can't open it", async () => {
    const mentionsForC = async () =>
      (await (await C.api.get("/api/activity")).json()).items.filter(
        (n: { kind: string; post_id: string }) => n.kind === "mention" && n.post_id === postId
      ).length;
    const say = () =>
      B.api.post(`/api/posts/${postId}/messages`, {
        data: { body: `hey @${norm(C.handle)} take a look ${Date.now()}` },
      });

    // Control: on a public thread the mention is delivered.
    expect((await say()).ok()).toBeTruthy();
    const before = await mentionsForC();
    expect(before).toBeGreaterThan(0);

    // Private thread, commenter is an approved follower, mentioned user is not.
    await setPrivacy(A, "private");
    await follow(B, A);
    await follow(A, B, "approve");
    expect((await say()).ok()).toBeTruthy();
    expect(await mentionsForC()).toBe(before);
  });
});
