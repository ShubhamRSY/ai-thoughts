import { test, expect } from "@playwright/test";

// P1: /api/health is what uptime monitoring and deploy checks hit. It must
// accurately report Mongo connectivity, not just "the process is alive".
test("GET /api/health reports ok with a reachable database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toMatchObject({
    ok: true,
    service: "ai-thoughts",
    mongo: "ok",
  });
});

// Since Sep 2026, the detailed env/index internals are only returned to a
// caller that presents a configured Bearer secret — anonymous probes must not
// learn which env var names are missing (env-confusion / supply-chain info).
test("GET /api/health hides config detail without a Bearer secret", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.json();
  expect(body.env.missing_required).toBeUndefined();
  expect(body.env.missing_recommended).toBeUndefined();
  expect(body.indexes).toBeUndefined();
});