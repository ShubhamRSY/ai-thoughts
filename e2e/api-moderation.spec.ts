import { test, expect, type APIRequestContext } from "@playwright/test";

// Moderation surface: reporting is strict about reasons, idempotent per
// (post, reporter), and resolves only under a keeper, with the who/when
// captured for the audit trail. These lock in the report/resolve fixes so a
// sloppy change can't silently reopen the gaps.
//
// IP trick identical to api-negative-cases: every context gets a unique
// synthetic X-Forwarded-For so the e2e server's in-memory rate buckets are
// never shared, and sign-in stays under the per-IP caps.

const ORIGIN = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`;
const originString = new URL(ORIGIN).origin;
test.use({ extraHTTPHeaders: { Origin: originString } });

// Matches the playwright.config webServer defaults for the dev server.
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-test-cron-secret";

async function persons(playwright: typeof import("playwright-core"), ipSuffix: string) {
  const ctx = await playwright.request.newContext({
    extraHTTPHeaders: {
      Origin: originString,
      "X-Forwarded-For": ipSuffix,
    },
  });
  return { ctx };
}

async function signIn(ctx: APIRequestContext, tag: string): Promise<string> {
  const email = `e2e-mod-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const signInRes = await ctx.post("/api/auth/sign-in", { data: { email } });
  const { devCode } = await signInRes.json();
  expect(devCode, "dev OTP code should be present (no RESEND_API_KEY in this env)").toMatch(
    /^\d{6}$/
  );
  const verifyRes = await ctx.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  const verifyBody = await verifyRes.json();
  expect(verifyRes.ok()).toBeTruthy();
  return verifyBody.user?.handle as string;
}

async function createPost(ctx: APIRequestContext): Promise<string> {
  const res = await ctx.post("/api/posts", {
    data: { content: `e2e moderation test post ${Date.now()}`, media_type: "text" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).id as string;
}

async function findReportId(ctx: APIRequestContext, postId: string): Promise<string> {
  const res = await ctx.get("/api/reports");
  expect(res.ok(), await res.text()).toBeTruthy();
  const list = (await res.json()) as Array<{ id: string; post_id: string }>;
  const match = list.find((r) => r.post_id === postId);
  expect(match, `an open report should exist for post ${postId}`).toBeTruthy();
  return (match as { id: string }).id;
}

test.describe("moderation: report and resolve", () => {
  let ownerCtx: APIRequestContext;
  let ownerHandle: string;

  test.beforeAll(async ({ playwright }) => {
    const owner = await persons(playwright, "194.1.10.1");
    ownerCtx = owner.ctx;
    ownerHandle = await signIn(owner.ctx, "owner");
    // Break-glass bootstrap in dev turns the owner into an admin, which
    // inherits keeper powers — the lightweight way to exercise keeper-gated
    // routes without external honest-broker wiring.
    const bs = await ownerCtx.post("/api/admin/controls", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      data: { action: "bootstrap", handle: ownerHandle },
    });
    expect(bs.status(), await bs.text()).toBe(200);
    expect((await bs.json()).ok).toBe(true);
  });

  test.afterAll(async () => {
    await ownerCtx.dispose();
  });

  test("rejects unknown reasons, canonicalizes the reported handle, and dedupes per reporter", async ({
    playwright,
  }) => {
    const reporter = await persons(playwright, "194.1.11.2");
    await signIn(reporter.ctx, "reporter");
    const postId = await createPost(ownerCtx);

    // Junk / "other" reasons must not silently become rows.
    for (const reason of ["", "not a real reason", "Other", "other", "Spam"]) {
      const res = await reporter.ctx.post(`/api/posts/${postId}/report`, {
        data: { reason },
      });
      expect(res.status(), `reason '${reason}' must be rejected`).toBe(400);
      const body = await res.json();
      expect(String(body.error).toLowerCase()).toContain("invalid report reason");
    }

    const first = await reporter.ctx.post(`/api/posts/${postId}/report`, {
      data: {
        reason: "Hate or harassment",
        // The reported author must come from the post itself, never the body.
        reported_handle: "@i-claim-this-is-the-author",
        content_snippet: "buying stuff 0123456789 at test@example.com right now",
      },
    });
    expect(first.status(), await first.text()).toBe(200);
    expect((await first.json()).ok).toBe(true);

    const second = await reporter.ctx.post(`/api/posts/${postId}/report`, {
      data: { reason: "Spam or coordinated accounts" },
    });
    expect(second.status(), "a second report from the same reporter 200s").toBe(200);
    expect((await second.json()).alreadyReported).toBe(true);

    // A keeper sees exactly one open report, with the true author and a
    // scrubbed snippet (no email/phone leaks into the desk).
    const reportsRes = await ownerCtx.get("/api/reports");
    expect(reportsRes.ok(), await reportsRes.text()).toBeTruthy();
    const reports = (await reportsRes.json()) as Array<Record<string, unknown>>;
    const mine = reports.filter((r) => r.post_id === postId);
    expect(mine).toHaveLength(1);
    expect(mine[0].reported_handle).toBe(ownerHandle);
    const snippet = mine[0].content_snippet as string;
    expect(snippet.length).toBeLessThanOrEqual(120);
    expect(snippet).not.toContain("@example.com");

    await ownerCtx.delete(`/api/posts/${postId}`);
    await reporter.ctx.dispose();
  });

  test("resolve is keeper-only, validates id/action, and clears the queue", async ({
    playwright,
  }) => {
    const attacker = await persons(playwright, "194.1.12.2");
    await signIn(attacker.ctx, "attacker");
    const postId = await createPost(ownerCtx);

    const report = await attacker.ctx.post(`/api/posts/${postId}/report`, {
      data: { reason: "Misleading or fake story" },
    });
    expect(report.status(), await report.text()).toBe(200);

    // Non-keepers are refused before id/action are even looked at.
    const asAttacker = await attacker.ctx.post(
      `/api/reports/not-an-object-id?action=resolve`
    );
    expect(asAttacker.status(), "non-keeper resolve must be rejected").toBe(403);
    const realId = await findReportId(ownerCtx, postId);
    const asAttackerReal = await attacker.ctx.post(`/api/reports/${realId}?action=resolve`);
    expect(asAttackerReal.status(), "non-keeper resolve of a real report must 403").toBe(403);

    // Keeper-side input validation, in order.
    const junkId = await ownerCtx.post(`/api/reports/not-an-object-id?action=resolve`);
    expect(junkId.status(), "junk id must be rejected").toBe(400);
    const ghostId = await ownerCtx.post(
      `/api/reports/000000000000000000000000?action=resolve`
    );
    expect(ghostId.status(), "unknown report id must 404").toBe(404);
    const badAction = await ownerCtx.post(`/api/reports/${realId}?action=pwned`);
    expect(badAction.status(), "unknown resolution action must 400").toBe(400);

    const ok = await ownerCtx.post(`/api/reports/${realId}?action=resolve`);
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).action).toBe("resolve");

    // The resolved report leaves the open queue.
    const after = (await (await ownerCtx.get("/api/reports")).json()) as Array<{
      post_id: string;
    }>;
    expect(after.find((r) => r.post_id === postId)).toBeUndefined();

    await ownerCtx.delete(`/api/posts/${postId}`);
    await attacker.ctx.dispose();
  });
});