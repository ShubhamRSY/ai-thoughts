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
    indexes: "ok",
  });
  expect(body.env.missing_required).toEqual([]);
});
