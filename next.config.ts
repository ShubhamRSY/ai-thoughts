import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

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
  // Pages get a per-request nonce CSP from src/proxy.ts (L3); API responses
  // are JSON that never runs script, so they get a policy allowing nothing
  // (headers() below).
];

const nextConfig: NextConfig = {
  devIndicators: false,
  // Tells the uploader (lib/db.ts) to store takes privately. Derived from the
  // server secret's presence so the two can't drift; the token itself stays server-side.
  env: { NEXT_PUBLIC_PRIVATE_MEDIA: process.env.BLOB_PRIVATE_READ_WRITE_TOKEN ? "1" : "" },
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
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
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
