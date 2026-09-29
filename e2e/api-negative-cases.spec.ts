import { test, expect, type APIRequestContext } from "@playwright/test";

// Negative + edge cases for the API surface the happy-path specs don't cover:
// junk ids, ghost accounts, arbitrary reaction strings, content validation,
// and the view endpoint's dedupe/404s. Each case also locks in a recent bug
// fix so it can't regress.
//
// A note on the IP trick below: `clientIp` (src/lib/rate-limit.ts) honors
// x-forwarded-for and the e2e server runs with stateful in-memory rate
// buckets, so all requests with no XFF share the bucket key "unknown" (e.g.
// sign-in is capped at 8/15min per IP). Giving every user context a unique
// synthetic IP means the suite's sign-ins never trip the per-IP caps of a
// long-lived dev server, while `sign-in:global` (40/h) still guards totals.

const ORIGIN = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`;
const originString = new URL(ORIGIN).origin;
test.use({ extraHTTPHeaders: { Origin: originString } });

// Each `api` context carries both the Origin header (CSRF gate) and a unique
// x-forwarded-for so rate limiter keys stay per-context in e2e.
async function persons(playwright: typeof import("playwright-core"), ipSuffix: string) {
  const ctx = await playwright.request.newContext({
    extraHTTPHeaders: {
      Origin: originString,
      "X-Forwarded-For": ipSuffix,
    },
  });
  return { ctx };
}

async function signIn(ctx: APIRequestContext, tag: string): Promise<{ handle: string }> {
  const email = `e2e-neg-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const signInRes = await ctx.post("/api/auth/sign-in", { data: { email } });
  const { devCode } = await signInRes.json();
  expect(devCode, "dev OTP code should be present (no RESEND_API_KEY in this env)").toMatch(
    /^\d{6}$/
  );
  const verifyRes = await ctx.post("/api/auth/verify", { data: { email, code: devCode } });
  const verifyBody = await verifyRes.json();
  expect(verifyRes.ok()).toBeTruthy();
  return { handle: verifyBody.user?.handle as string };
}

async function createPost(ctx: APIRequestContext): Promise<string> {
  const res = await ctx.post("/api/posts", {
    data: { content: `e2e negative test post ${Date.now()}`, media_type: "text" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).id as string;
}

test.describe("negative and edge cases", () => {
  // One shared owner for every test keeps this spec's total sign-in count low
  // (the suite must stay under the 40/hour global OTP budget).
  let ownerCtx: APIRequestContext;
  let ownerHandle: string;

  test.beforeAll(async ({ playwright }) => {
    const owner = await persons(playwright, "194.1.0.1");
    ownerCtx = owner.ctx;
    const user = await signIn(owner.ctx, "shared-owner");
    ownerHandle = user.handle;
  });

  test.afterAll(async () => {
    await ownerCtx.dispose();
  });

  test("posts rejects empty, whitespace-only, and over-length content", async () => {
    const empty = await ownerCtx.post("/api/posts", {
      data: { content: "   ", media_type: "text" },
    });
    expect(empty.status(), "whitespace-only content must be rejected").toBe(400);

    const tooLong = await ownerCtx.post("/api/posts", {
      data: { content: "x".repeat(501), media_type: "text" },
    });
    expect(tooLong.status(), "over-500 content must be rejected").toBe(400);

    const badMedia = await ownerCtx.post("/api/posts", {
      data: { content: "fine but", media_type: "doc" },
    });
    expect(badMedia.status(), "unknown media_type must be rejected").toBe(400);
  });

  test("an empty JSON body is a 400, not a server error", async () => {
    // What a client that disconnects mid-send leaves behind. It used to reach
    // request.json() in the route, throw, and come back as a reported 500.
    const postId = await createPost(ownerCtx);
    const res = await ownerCtx.post(`/api/posts/${postId}/messages`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status(), await res.text()).toBe(400);
    await ownerCtx.delete(`/api/posts/${postId}`);
  });

  test("report rejects bogus id, nonexistent post, and then works on a real one", async ({
    playwright,
  }) => {
    const reporter = await persons(playwright, "194.1.2.2");
    await signIn(reporter.ctx, "reporter");
    const postId = await createPost(ownerCtx);
    const reason = { reason: "Hate or harassment" };

    const badId = await reporter.ctx.post("/api/posts/not-an-object-id/report", {
      data: reason,
    });
    expect(badId.status(), "junk id must not create a report").toBe(400);

    const ghost = await reporter.ctx.post("/api/posts/000000000000000000000000/report", {
      data: reason,
    });
    expect(ghost.status(), "ghost post must 404, not insert a report").toBe(404);

    const ok = await reporter.ctx.post(`/api/posts/${postId}/report`, { data: reason });
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).ok).toBe(true);

    await ownerCtx.delete(`/api/posts/${postId}`);
    await reporter.ctx.dispose();
  });

  test("following a ghost handle fails, real accounts still work", async ({ playwright }) => {
    const me = await persons(playwright, "194.1.3.2");
    await signIn(me.ctx, "me-follow");

    const ghost = await me.ctx.post("/api/follows", {
      data: { handle: "@definitely-an-unknown-user" },
    });
    expect(ghost.status(), "ghost handles must not create follow rows").toBe(400);
    expect((await ghost.json()).error).toBeTruthy();

    const follow = await me.ctx.post("/api/follows", { data: { handle: ownerHandle } });
    expect(follow.ok(), await follow.text()).toBeTruthy();
    expect((await follow.json()).following).toBe(true);

    const unfollow = await me.ctx.post("/api/follows", {
      data: { action: "unfollow", handle: ownerHandle },
    });
    expect(unfollow.ok(), await unfollow.text()).toBeTruthy();
    expect((await unfollow.json()).following).toBe(false);

    await me.ctx.dispose();
  });

  test("reactions reject arbitrary strings and accept the product set", async ({
    playwright,
  }) => {
    const user = await persons(playwright, "194.1.4.2");
    await signIn(user.ctx, "react-user");
    const postId = await createPost(ownerCtx);

    for (const junk of ["💩", "abcdefgh", "❤️❤️", "".padEnd(8, "x")]) {
      const res = await user.ctx.post(`/api/posts/${postId}/reactions`, {
        data: { reaction: junk },
      });
      expect(res.status(), `junk reaction must be rejected`).toBe(400);
    }

    const like = await user.ctx.post(`/api/posts/${postId}/reactions`, {
      data: { reaction: "❤️" },
    });
    expect(like.status(), await like.text()).toBe(200);
    expect((await like.json()).action).toBe("added");

    const bookmark = await user.ctx.post(`/api/posts/${postId}/reactions`, {
      data: { reaction: "🔖" },
    });
    expect(bookmark.status(), await bookmark.text()).toBe(200);

    await ownerCtx.delete(`/api/posts/${postId}`);
    await user.ctx.dispose();
  });

  test("views reject bad ids and dedupe per viewer", async ({ playwright }) => {
    const user = await persons(playwright, "194.1.5.2");
    await signIn(user.ctx, "view-user");
    const postId = await createPost(ownerCtx);

    const badId = await user.ctx.post(`/api/posts/not-an-object-id/view`);
    expect(badId.status(), "junk id must not be recorded").toBe(400);

    const ghost = await user.ctx.post(`/api/posts/000000000000000000000000/view`);
    expect(ghost.status(), "view of a nonexistent post must 404").toBe(404);

    const first = await user.ctx.post(`/api/posts/${postId}/view`);
    expect((await first.json()).view_count).toBe(1);

    const second = await user.ctx.post(`/api/posts/${postId}/view`);
    expect((await second.json()).view_count).toBe(1);

    await ownerCtx.delete(`/api/posts/${postId}`);
    await user.ctx.dispose();
  });
});