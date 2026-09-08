import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "aithoughts.session";

const PROTECTED_PATHS = ["/app", "/keeper"];

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function validateToken(token: string): Promise<boolean> {
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return false;

    const expectedSig = await hmacSign(encoded, getSecret());
    if (signature !== expectedSig) return false;

    const payload = JSON.parse(atob(encoded));
    return payload.exp >= Date.now();
  } catch {
    return false;
  }
}

// Security headers (X-Frame-Options, CSP, etc.) live in next.config.ts's
// headers() — that's the single source of truth so it can't drift out of
// sync with a second copy here.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next();

  // Check protected routes
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isProtected) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(signInUrl);
    }

    const valid = await validateToken(token);
    if (!valid) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("from", pathname);
      const res = NextResponse.redirect(signInUrl);
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
  }

  // Redirect / to /app if logged in
  if (pathname === "/") {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      const valid = await validateToken(token);
      if (valid) {
        return NextResponse.redirect(new URL("/app", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|media|manifest.webmanifest|sw.js).*)",
  ],
};
