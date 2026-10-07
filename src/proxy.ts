import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions, validateSession } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { reportError } from "@/lib/report-error";

// Voices needs an account: reading and writing both ask for sign-in, and the
// proxy sends guests to the sign-in page before /app loads. The API guards
// the first write (share, react, reply, report) as the second layer.
const PROTECTED_PATHS = ["/app", "/keeper", "/admin"];
// Reading feed content (takes, replies, people, profiles, feelings) is
// members-only too, so a guest can't pull it straight off the API. Writes are
// already guarded inside each route.
const MEMBER_API_PATHS = ["/api/posts", "/api/people", "/api/profile", "/api/prompt", "/api/feelings", "/api/search"];
const AUTH_PAGES = ["/sign-in"];
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Backstop, not the primary defense: routes still keep their own tighter
// rate.limit() calls. This just bounds any endpoint that forgets one (as
// messages/reactions/report did) so a future miss doesn't go unthrottled.
const BACKSTOP_LIMIT = 300;
const BACKSTOP_WINDOW_MS = 5 * 60_000;

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defense-in-depth for cookie-authenticated mutations. SameSite=Lax on
 * the session cookie (see sessionCookieOptions) already blocks it from being
 * sent on cross-site POSTs, so this is a second layer, not the only one: it
 * also catches a session cookie replayed with Origin/Referer stripped or
 * spoofed by something other than a normal browser fetch.
 */
function blockedByOriginCheck(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) return false;
  if (!request.cookies.get(SESSION_COOKIE)) return false;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const selfOrigin = request.nextUrl.origin;

  if (origin) return origin !== selfOrigin;
  if (referer) return originOf(referer) !== selfOrigin;
  // A cookie-carrying mutation with neither header is not how browser fetch
  // behaves — treat it as suspicious rather than trust it by default.
  return true;
}

// Full check, not just the signature: a signed-out or revoked cookie is still
// validly signed, and must not open /app. null = couldn't check (DB down):
// answer 503 and keep the cookie — treating it as signed-out logged every
// member out on a DB blip and sent them all to the OTP email cap at once.
async function hasValidSession(request: NextRequest): Promise<boolean | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    return Boolean(await validateSession(token));
  } catch (e) {
    console.error("session check unavailable:", e);
    reportError(e, { route: "proxy", service: "mongodb" });
    return null;
  }
}

const unavailable = () =>
  NextResponse.json(
    { error: "Temporarily unavailable — try again shortly" },
    { status: 503, headers: { "Retry-After": "5" } }
  );

// A DB blip during a page navigation must not dump raw JSON at the reader.
// Same 503, self-contained markup (no external refs), with an auto-reload.
const unavailablePage = () => {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>AiTo is briefly unavailable</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0b0f14;color:#ecf2fa;display:grid;place-items:center;min-height:100dvh}
  main{max-width:26rem;padding:2rem 1.5rem;text-align:center}
  h1{font-size:1.35rem;margin:0 0 .5rem}
  p{font-size:.95rem;line-height:1.55;color:#93a3b4;margin:0 0 1.25rem}
  button{background:#2f7ccf;border:0;color:#fff;font-weight:600;font-size:.95rem;border-radius:999px;padding:.65rem 1.5rem;cursor:pointer}
  button:hover{background:#3c8be0}
</style>
</head>
<body>
<main>
  <h1>AiTo is briefly unavailable</h1>
  <p>Something went wrong on our side. Try again in a few seconds — your login is safe.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Retry-After": "5",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
};

// Every route destructures `await request.json()` inside a catch-all that
// answers 500, so `{` or `null` turned into server errors (and error-log
// noise anyone could generate). Rejecting it here covers all of them.
async function hasMalformedJsonBody(request: NextRequest): Promise<boolean> {
  if (!MUTATING_METHODS.has(request.method)) return false;
  if (!request.headers.get("content-type")?.includes("application/json")) return false;
  // Every JSON caller sends a body, so an empty or unreadable one is a client
  // that disconnected mid-send. Answer 400 here rather than let the route's
  // request.json() throw into a 500 that gets reported as a server error.
  let text: string;
  try {
    text = await request.clone().text();
  } catch {
    return true;
  }
  if (!text) return true;
  try {
    const body: unknown = JSON.parse(text);
    return body === null || typeof body !== "object";
  } catch {
    return true;
  }
}

/**
 * Page CSP with a fresh nonce per response (SECURITY_AUDIT.md L3). Next reads
 * the nonce from the request's CSP header while rendering and stamps it on its
 * own scripts; 'strict-dynamic' then trusts what those load (Turnstile,
 * Vercel Analytics), so no inline script runs without the nonce. Inline
 * *style attributes* still need 'unsafe-inline' in style-src; nonces don't
 * cover attributes, and styles can't run code.
 */
function pageCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  const blob = "https://*.public.blob.vercel-storage.com https://*.private.blob.vercel-storage.com";
  return [
    "default-src 'self'",
    // 'unsafe-eval' only for dev: React uses eval there for error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${blob}`,
    "font-src 'self'",
    `connect-src 'self' ${blob} https://blob.vercel-storage.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io`,
    `media-src 'self' blob: ${blob}`,
    "frame-ancestors 'none'",
    // No fallback to default-src for these three, so they must be explicit.
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Cloudflare Turnstile (sign-in CAPTCHA) renders in an iframe.
    "frame-src https://challenges.cloudflare.com",
  ].join("; ");
}

/** Continue to the page with a per-request nonce CSP on request and response. */
function nextWithCsp(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = pageCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

function under(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function guardApi(request: NextRequest) {
  const ip = clientIp(request);
  const { ok } = await rateLimit(`api-backstop:${ip}`, BACKSTOP_LIMIT, BACKSTOP_WINDOW_MS);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (blockedByOriginCheck(request)) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  // Matches proxyClientMaxBodySize in next.config.ts; refuse before reading.
  if (Number(request.headers.get("content-length")) > 1024 * 1024) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  if (await hasMalformedJsonBody(request)) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const isRead = request.method === "GET" || request.method === "HEAD";
  if (isRead && under(request.nextUrl.pathname, MEMBER_API_PATHS)) {
    const valid = await hasValidSession(request);
    if (valid === null) return unavailable();
    if (!valid) return NextResponse.json({ error: "Sign in to see Voices" }, { status: 401 });
  }

  return NextResponse.next();
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) return guardApi(request);

  if (under(pathname, PROTECTED_PATHS)) {
    const valid = await hasValidSession(request);
    if (valid === null) return unavailablePage();
    if (!valid) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("from", pathname);
      const res = NextResponse.redirect(signInUrl);
      res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
      return res;
    }
    return nextWithCsp(request);
  }

  // Already joined → never show join / landing again
  if ((pathname === "/" || AUTH_PAGES.includes(pathname)) && (await hasValidSession(request)) === true) {
    const from = request.nextUrl.searchParams.get("from");
    const dest = safeRedirectPath(from);
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return nextWithCsp(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|media|manifest.webmanifest|sw.js).*)",
  ],
};
