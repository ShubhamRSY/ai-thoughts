import { test, expect, type APIRequestContext } from "@playwright/test";

// P1: repost, bookmark, and view-count are new backend behavior (this repo
// has no UI test for them yet — FeedCard needs a real post + media to open
// /app against). Testing the endpoints directly is deterministic and fast,
// and exercises exactly the logic that's new: toggle idempotency and the
// view-count dedup upsert.

// Playwright's request context isn't a browser: it sends the session cookie but
// no Origin, which src/proxy.ts's CSRF check (correctly) rejects. Send the one
// a real same-origin fetch would.
const ORIGIN = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`;
test.use({ extraHTTPHeaders: { Origin: new URL(ORIGIN).origin } });

async function signIn(request: APIRequestContext): Promise<void> {
  const email = `e2e-actions-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const signInRes = await request.post("/api/auth/sign-in", { data: { email } });
  const { devCode } = await signInRes.json();
  expect(devCode, "dev OTP code should be present (no RESEND_API_KEY in this env)").toMatch(
    /^\d{6}$/
  );
  const verifyRes = await request.post("/api/auth/verify", { data: { email, code: devCode } });
  expect(verifyRes.ok()).toBeTruthy();
}

async function createPost(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/posts", {
    data: { content: `e2e test post ${Date.now()}`, media_type: "text" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  return body.id as string;
}

test.describe("post actions: repost, bookmark, views", () => {
  test("cookie-authenticated mutation from a foreign origin is blocked", async ({ request }) => {
    await signIn(request);
    const res = await request.post("/api/posts", {
      headers: { Origin: "https://evil.example" },
      data: { content: "csrf probe", media_type: "text" },
    });
    expect(res.status()).toBe(403);
  });

  test("repost and bookmark toggle idempotently and independently", async ({ request }) => {
    await signIn(request);
    const postId = await createPost(request);

    // Repost on, then off.
    const boostOn = await request.post(`/api/posts/${postId}/reactions`, {
      data: { reaction: "🔁" },
    });
    expect((await boostOn.json()).action).toBe("added");

    const boostOff = await request.post(`/api/posts/${postId}/reactions`, {
      data: { reaction: "🔁" },
    });
    expect((await boostOff.json()).action).toBe("removed");

    // Bookmark is independent of repost — toggling one doesn't affect the other.
    const bookmarkOn = await request.post(`/api/posts/${postId}/reactions`, {
      data: { reaction: "🔖" },
    });
    expect((await bookmarkOn.json()).action).toBe("added");

    const feedWithBookmark = await request.get("/api/posts");
    const bookmarked = (await feedWithBookmark.json()).find(
      (p: { id: string }) => p.id === postId
    );
    expect(bookmarked.boosted_by_me).toBe(false);
    expect(bookmarked.bookmarked_by_me).toBe(true);

    // Removing the bookmark (what the Saved list's remove button does) drops
    // it out of bookmarked_by_me — this is what makes it disappear from the
    // Saved section on the You tab.
    const bookmarkOff = await request.post(`/api/posts/${postId}/reactions`, {
      data: { reaction: "🔖" },
    });
    expect((await bookmarkOff.json()).action).toBe("removed");

    const feedAfterUnsave = await request.get("/api/posts");
    const unsaved = (await feedAfterUnsave.json()).find((p: { id: string }) => p.id === postId);
    expect(unsaved.bookmarked_by_me).toBe(false);

    await request.delete(`/api/posts/${postId}`);
  });

  test("viewing the same post twice only counts once", async ({ request }) => {
    await signIn(request);
    const postId = await createPost(request);

    const first = await request.post(`/api/posts/${postId}/view`);
    expect((await first.json()).view_count).toBe(1);

    const second = await request.post(`/api/posts/${postId}/view`);
    expect((await second.json()).view_count).toBe(1);

    await request.delete(`/api/posts/${postId}`);
  });
});
