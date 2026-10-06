import { defineConfig, devices } from "@playwright/test";
import { FAKE_MODERATION_PORT } from "./e2e/fake-moderation";

const PORT = process.env.PORT ?? "3000";
// Must be "localhost", not "127.0.0.1": next dev's allowedDevOrigins check
// (defaults to trusting only "localhost") otherwise silently blocks the
// client fetch that resolves the useSearchParams() Suspense boundary on
// /sign-in, hanging the page forever with no console error.
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E tests need a real MongoDB (auth, sessions, and even the landing page
 * read pulse stats from it). Start one before running locally:
 *   ./e2e/start-test-mongo.sh
 * (not a plain `docker run mongo:7` — see that script's comment for why).
 * See e2e/README.md for details.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false, // shares one dev-server process + in-memory rate limiter
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // "list" on CI too: one line per test. The github/dot reporter writes dots
  // with no newline, which Actions only shows once the line ends — so a slow
  // run looked frozen until it was killed.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // `next dev` compiles each route on first hit (5–7s for some API routes,
  // longer for /app), and a test touching several cold routes blew the old 45s
  // budget and the 5s assertion default. Warm tests still finish in seconds.
  timeout: 120_000,
  // Backstop so a genuinely stuck run fails with a report (which test hung)
  // instead of hanging until the runner is killed. A healthy CI run is ~10–15m.
  globalTimeout: 30 * 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          NODE_ENV: "development",
          AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-test-secret-not-for-prod",
          CRON_SECRET: process.env.CRON_SECRET ?? "e2e-test-cron-secret",
          MONGODB_URL:
            process.env.MONGODB_URL ??
            "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true",
          MONGODB_DB: process.env.MONGODB_DB ?? "aithoughts-e2e",
          // Tests give each context its own X-Forwarded-For so rate-limit
          // buckets stay per-test; clientIp() only honors that header behind a
          // trusted proxy, so run the server as if behind one hop.
          TRUSTED_PROXY_HOPS: "1",
          // `next dev` also loads .env.local, which holds real credentials.
          // A key already set here (even to "") wins over .env.local, so blank
          // every external service: tests must never reach Blob, email,
          // OpenAI, Turnstile, Upstash or Vercel with a real token.
          BLOB_READ_WRITE_TOKEN: "",
          BLOB_PRIVATE_READ_WRITE_TOKEN: "",
          VERCEL_OIDC_TOKEN: "",
          RESEND_API_KEY: "",
          // Screening goes to the local fake in e2e/fake-moderation.ts.
          OPENAI_API_KEY: "e2e-fake-key",
          OPENAI_BASE_URL: `http://127.0.0.1:${FAKE_MODERATION_PORT}`,
          TURNSTILE_SECRET_KEY: "",
          UPSTASH_REDIS_REST_URL: "",
          UPSTASH_REDIS_REST_TOKEN: "",
          KV_REST_API_URL: "",
          KV_REST_API_TOKEN: "",
          VAPID_PRIVATE_KEY: "",
          SENTRY_AUTH_TOKEN: "",
          NEXT_PUBLIC_SENTRY_DSN: "",
          // See next.config.ts: skip the Sentry build wrapper under test.
          E2E_SKIP_SENTRY_WRAP: "1",
        },
      },
});
