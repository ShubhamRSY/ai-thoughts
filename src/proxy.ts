import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { SESSION_COOKIE } from "@/lib/auth";

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

export async function proxy(request: NextRequest) {
  const ip = clientIp(request);
  const { ok } = await rateLimit(`api-backstop:${ip}`, BACKSTOP_LIMIT, BACKSTOP_WINDOW_MS);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (blockedByOriginCheck(request)) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
