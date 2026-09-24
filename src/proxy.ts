import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { SESSION_COOKIE, validateSession } from "@/lib/auth";

// Voices needs an account: reading and writing both ask for sign-in, and the
// proxy sends guests to the sign-in page before /app loads. The API guards
// the first write (share, react, reply, report) as the second layer.
const PROTECTED_PATHS = ["/app", "/keeper", "/admin"];
// Reading feed content (takes, replies, people, profiles, feelings) is
// members-only too, so a guest can't pull it straight off the API. Writes are
// already guarded inside each route.
const MEMBER_API_PATHS = ["/api/posts", "/api/people", "/api/profile", "/api/prompt", "/api/feelings"];
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
// validly signed, and must not open /app.
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return Boolean(token && (await validateSession(token)));
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

  const isRead = request.method === "GET" || request.method === "HEAD";
  if (isRead && under(request.nextUrl.pathname, MEMBER_API_PATHS) && !(await hasValidSession(request))) {
    return NextResponse.json({ error: "Sign in to see Voices" }, { status: 401 });
  }

  return NextResponse.next();
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) return guardApi(request);

  if (under(pathname, PROTECTED_PATHS)) {
    if (!(await hasValidSession(request))) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("from", pathname);
      const res = NextResponse.redirect(signInUrl);
      res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }
    return NextResponse.next();
  }

  // Already joined → never show join / landing again
  if ((pathname === "/" || AUTH_PAGES.includes(pathname)) && (await hasValidSession(request))) {
    const from = request.nextUrl.searchParams.get("from");
    const dest = from && from.startsWith("/") && !from.startsWith("//") ? from : "/app";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|media|manifest.webmanifest|sw.js).*)",
  ],
};
