import { chromium, type FullConfig } from "@playwright/test";
import { MongoClient, ServerApiVersion } from "mongodb";
import { FAKE_MODERATION_PORT, startFakeModeration } from "./fake-moderation";

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
      body: JSON.stringify({ email, code: devCode, age_confirmed: true }),
      signal: AbortSignal.timeout(120_000),
    });
    const cookies = verify.headers.getSetCookie().map((c) => c.split(";")[0]);
    return cookies.length ? cookies.join("; ") : null;
  } catch {
    return null;
  }
}

// Same default as playwright.config.ts's webServer env.
const DEFAULT_MONGO_URL =
  "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";

/** Strip any embedded credentials before a connection string reaches a log. */
function redact(url: string): string {
  return url.replace(/\/\/[^@/]*@/, "//***:***@");
}

/**
 * Without this, a missing MongoDB doesn't surface until the first test hits the
 * app: every test then fails with ECONNREFUSED and the run ends in Playwright's
 * opaque "The operation was canceled". Fail here instead, with the fix.
 */
async function assertMongoReachable(config: FullConfig) {
  const url =
    (config.webServer as { env?: Record<string, string> } | undefined)?.env?.MONGODB_URL ??
    process.env.MONGODB_URL ??
    DEFAULT_MONGO_URL;

  const client = new MongoClient(url, {
    // Must mirror src/lib/mongodb.ts's connect options. With Node's default
    // happy-eyeballs the driver fails against the test container with
    // "connection <monitor> to 127.0.0.1:27017 closed" even though the app
    // itself connects fine — the IPv4 pinning is what makes it agree.
    serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: false },
    autoSelectFamily: false,
    family: 4,
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
  } catch (e) {
    throw new Error(
      `E2E needs a running MongoDB, but could not reach it at ${redact(url)}.\n` +
        `Start one first:  ./e2e/start-test-mongo.sh\n` +
        `Underlying error: ${(e as Error).message}`
    );
  } finally {
    await client.close().catch(() => {});
  }
}

/** startFakeModeration's raw EADDRINUSE doesn't say which port or what to do. */
async function startModeration() {
  try {
    return await startFakeModeration();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") {
      throw new Error(
        `Port ${FAKE_MODERATION_PORT} is already in use, so the fake moderation ` +
          `server could not start. A previous e2e run most likely left one behind.\n` +
          `Stop it first:  lsof -ti tcp:${FAKE_MODERATION_PORT} | xargs kill`
      );
    }
    throw e;
  }
}

export default async function globalSetup(config: FullConfig) {
  await assertMongoReachable(config);
  // Up for the whole run; Playwright calls the returned function at the end.
  const stopModeration = await startModeration();
  // That teardown doesn't run when the run is interrupted (Ctrl-C, or the
  // globalTimeout in playwright.config.ts), which would orphan the listener on
  // FAKE_MODERATION_PORT and make the *next* run fail on EADDRINUSE. Just close
  // the listener — don't process.exit(), which would pre-empt Playwright's own
  // graceful shutdown and cost us the failure report.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void stopModeration().catch(() => {}));
  }
  await warmUp(config);
  return stopModeration;
}

async function warmUp(config: FullConfig) {
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
