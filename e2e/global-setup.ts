import { chromium, type FullConfig } from "@playwright/test";

/**
 * `next dev` compiles each route on first request, which can take well over
 * a normal 30s test timeout for a cold server. Hit every route the suite
 * exercises once, up front (sequentially, generous timeout), so the actual
 * test timings measure the app — not first-compile latency.
 */
const ROUTES = ["/", "/sign-in", "/admin", "/privacy", "/terms", "/guidelines", "/install", "/api/health"];

// Only compile when a signed-in request reaches them — the proxy redirects or
// 401s guests before the route runs. The Account Center APIs took 5–7s cold.
const MEMBER_ROUTES = [
  "/app",
  "/api/posts",
  "/api/account/privacy",
  "/api/follows/requests",
  "/api/blocks",
  "/api/mutes",
  "/api/account/sessions",
];

async function warm(url: URL, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
    await res.text();
    return res;
  } catch {
    // A warm-up failure here isn't fatal — the real test will surface it
    // with a proper assertion and error message.
    return null;
  }
}

/** A throwaway dev-mode session (the server returns devCode off Vercel). */
async function devSessionCookie(baseURL: string): Promise<string | null> {
  // Its own forwarded IP, so warm-up doesn't spend any test's sign-in budget.
  const headers = { "Content-Type": "application/json", "X-Forwarded-For": "10.250.0.1" };
  const email = `e2e-warmup-${Date.now()}@example.com`;
  try {
    const signIn = await fetch(new URL("/api/auth/sign-in", baseURL), {
      method: "POST",
      headers,
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(120_000),
    });
    const { devCode } = (await signIn.json()) as { devCode?: string };
    if (!devCode) return null;
    const verify = await fetch(new URL("/api/auth/verify", baseURL), {
      method: "POST",
      headers,
      body: JSON.stringify({ email, code: devCode }),
      signal: AbortSignal.timeout(120_000),
    });
    const cookies = verify.headers.getSetCookie().map((c) => c.split(";")[0]);
    return cookies.length ? cookies.join("; ") : null;
  } catch {
    return null;
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  for (const route of ROUTES) await warm(new URL(route, baseURL));

  const cookie = await devSessionCookie(baseURL);
  if (!cookie) return;
  const headers = { Cookie: cookie, "X-Forwarded-For": "10.250.0.1" };
  for (const route of MEMBER_ROUTES) await warm(new URL(route, baseURL), { headers });

  // Fetching /app only compiles its server side; the browser bundle compiles
  // when a real browser loads it (~10s here, far longer on a 2-core runner),
  // and the dev server stalls other requests meanwhile. Do that here, not in
  // the first test.
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "10.250.0.1" } });
    await context.addCookies(
      cookie.split("; ").map((pair) => {
        const i = pair.indexOf("=");
        return { name: pair.slice(0, i), value: pair.slice(i + 1), url: baseURL };
      })
    );
    const page = await context.newPage();
    await page.goto(new URL("/app", baseURL).toString(), { timeout: 180_000 });
    await page.waitForLoadState("networkidle", { timeout: 180_000 });
  } catch {
    // Not fatal, like the fetches above.
  } finally {
    await browser.close();
  }
}
