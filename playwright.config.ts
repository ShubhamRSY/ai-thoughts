import { defineConfig, devices } from "@playwright/test";

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
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // `next dev` compiles each route on first hit (5–7s for some API routes,
  // longer for /app), and a test touching several cold routes blew the old 45s
  // budget and the 5s assertion default. Warm tests still finish in seconds.
  timeout: 120_000,
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
        },
      },
});
