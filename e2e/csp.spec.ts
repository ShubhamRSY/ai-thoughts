import { test, expect, type Page } from "@playwright/test";
import { MongoClient } from "mongodb";
import { createHmac } from "node:crypto";

// SECURITY_AUDIT.md L3: pages run under a per-request nonce CSP with no
// 'unsafe-inline' for scripts. Every page must load without a single CSP
// violation and its JavaScript must actually run. Meant to be run against a
// production build too (dev CSP differs) — see e2e/README.md:
//   E2E_BASE_URL=http://localhost:3100 E2E_DB_NAME=aithoughts-e2e npx playwright test e2e/csp.spec.ts

const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`;
const AUTH_SECRET = process.env.AUTH_SECRET ?? "e2e-test-secret-not-for-prod";
const MONGO_URL =
  process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";
// A dev server uses "<db>_dev" (dbName() in src/lib/mongodb.ts); a production build doesn't.
const MONGO_DB =
  process.env.E2E_DB_NAME ?? ((b) => (b.endsWith("_dev") ? b : `${b}_dev`))(process.env.MONGODB_DB ?? "aithoughts-e2e");
let ipSeq = 0;

/** Records CSP violations and CSP console errors for this page. */
async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": `10.89.0.${++ipSeq}` });
  const consoleHits: string[] = [];
  page.on("console", (m) => {
    // Only CSP refusals. (Off Vercel, /_vercel/insights/script.js is a 404
    // served as text/plain, which Chrome refuses on MIME type — not CSP.)
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) {
      consoleHits.push(m.text());
    }
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)
    );
  });
  return async () => [...consoleHits, ...(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp))];
}

/** A signed-in browser for a user created in the test database (works without dev sign-in codes). */
async function signInAs(page: Page) {
  const mongo = new MongoClient(MONGO_URL, { tls: true });
  await mongo.connect();
  try {
    const handle = `@csp${Date.now().toString(36)}`;
    const { insertedId } = await mongo
      .db(MONGO_DB)
      .collection("users")
      .insertOne({ handle, displayName: "CSP test", createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() });
    const payload = Buffer.from(
      JSON.stringify({ id: String(insertedId), handle, displayName: "CSP test", exp: Date.now() + 864e5 })
    ).toString("base64url");
    const sig = createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");
    await page.context().addCookies([{ name: "aithoughts.session", value: `${payload}.${sig}`, url: BASE }]);
  } finally {
    await mongo.close();
  }
}

test("pages send a nonce CSP without 'unsafe-inline' scripts; APIs allow nothing", async ({ request }) => {
  const page = await request.get("/privacy");
  const csp = page.headers()["content-security-policy"] ?? "";
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
  expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  // A fresh nonce every response.
  const again = (await request.get("/privacy")).headers()["content-security-policy"];
  expect(again).not.toBe(csp);
  expect((await request.get("/api/health")).headers()["content-security-policy"]).toContain("default-src 'none'");
});

for (const path of ["/", "/privacy", "/terms", "/guidelines", "/install", "/trust", "/contact", "/dmca"]) {
  test(`public page ${path} loads with no CSP violations`, async ({ page }) => {
    const violations = await watchCsp(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await violations()).toEqual([]);
  });
}

test("sign-in works under the CSP (its script runs and calls the API)", async ({ page }) => {
  const violations = await watchCsp(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(`e2e-csp-${Date.now()}@example.com`);
  await page.getByRole("checkbox", { name: /18 or older/ }).check();
  const call = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in"));
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await call;
  expect(await violations()).toEqual([]);
});

for (const path of ["/app", "/keeper", "/admin"]) {
  test(`signed-in page ${path} loads and runs under the CSP`, async ({ page }) => {
    await signInAs(page);
    const violations = await watchCsp(page);
    const apiCall = page.waitForResponse((r) => r.url().includes("/api/"));
    await page.goto(path);
    await apiCall; // the page's own script fetched data, so it ran
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain(path);
    expect(await violations()).toEqual([]);
  });
}

test("the watcher itself catches a violation (so the zero-violation checks mean something)", async ({ page }) => {
  const violations = await watchCsp(page);
  await page.goto("/privacy");
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "csp-probe";
    b.setAttribute("onclick", "window.__ran = true");
    document.body.appendChild(b);
    b.click(); // inline handlers need 'unsafe-inline' — blocked, and reported
  });
  await expect.poll(async () => (await violations()).length).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as { __ran?: boolean }).__ran)).toBeUndefined();
});
