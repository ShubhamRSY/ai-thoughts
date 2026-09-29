import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// 'unsafe-eval' is only needed for dev-mode HMR (Turbopack/webpack) — a
// production build never legitimately calls eval(), so dropping it there
// meaningfully strengthens the XSS defense-in-depth story.
const scriptSrc =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com"
    : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Don't leak path/query to third parties — origin only on HTTPS navigations.
  { key: "Referrer-Policy", value: "strict-origin" },
  {
    // camera/microphone must allow 'self' — the share flow's own
    // MediaRecorder capture (src/hooks/useMediaRecorder.ts) needs them.
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), geolocation=(), interest-cohort=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
      "font-src 'self'",
      "connect-src 'self' https://*.public.blob.vercel-storage.com https://blob.vercel-storage.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
      "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
      "frame-ancestors 'none'",
      // No fallback to default-src for these three, so they must be explicit.
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      // Cloudflare Turnstile (sign-in CAPTCHA) renders in an iframe.
      "frame-src https://challenges.cloudflare.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false, // don't advertise the framework/version to scanners
  experimental: {
    // proxy.ts makes Next buffer every request body in memory (default 10MB).
    // Our largest real JSON body is a few KB (media goes straight to Blob), so
    // cap it — 20 parallel 20MB junk posts added ~180MB RSS at the default.
    proxyClientMaxBodySize: "1mb",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// Source-map upload only runs when the Vercel Sentry integration's vars are present.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Upload a larger set of source maps for prettier stack traces (longer builds).
  widenClientFileUpload: true,
});
