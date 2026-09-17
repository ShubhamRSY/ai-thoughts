import type { FullConfig } from "@playwright/test";

/**
 * `next dev` compiles each route on first request, which can take well over
 * a normal 30s test timeout for a cold server. Hit every route the suite
 * exercises once, up front (sequentially, generous timeout), so the actual
 * test timings measure the app — not first-compile latency.
 */
const ROUTES = ["/", "/sign-in", "/admin", "/privacy", "/terms", "/guidelines", "/install", "/api/health"];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  for (const route of ROUTES) {
    try {
      const res = await fetch(new URL(route, baseURL), { signal: AbortSignal.timeout(120_000) });
      await res.text();
    } catch {
      // A warm-up failure here isn't fatal — the real test will surface it
      // with a proper assertion and error message.
    }
  }
}
