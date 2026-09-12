import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "aithoughts.session";
const PROTECTED_PATHS = ["/app", "/keeper"];
const AUTH_PAGES = ["/sign-in"];

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

function decodeSessionPayload(encoded: string): { exp?: number } | null {
  try {
    // Prefer base64url (new tokens); fall back to legacy btoa(JSON) tokens.
    try {
      const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
      const withPad = padded + "=".repeat((4 - (padded.length % 4)) % 4);
      const binary = atob(withPad);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return JSON.parse(atob(encoded));
    }
  } catch {
    return null;
  }
}

/** Edge-safe constant-time compare (no node:crypto in middleware). */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function validateToken(token: string): Promise<boolean> {
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return false;

    const expectedSig = await hmacSign(encoded, getSecret());
    if (!timingSafeEqualStr(signature, expectedSig)) return false;

    const payload = decodeSessionPayload(encoded);
    return Boolean(payload?.exp && payload.exp >= Date.now());
  } catch {
    return false;
  }
}

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return validateToken(token);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isProtected) {
    const valid = await hasValidSession(request);
    if (!valid) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("from", pathname);
      const res = NextResponse.redirect(signInUrl);
      res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }
    return NextResponse.next();
  }

  // Already joined → never show join / landing again
  if (pathname === "/" || AUTH_PAGES.includes(pathname)) {
    if (await hasValidSession(request)) {
      const from = request.nextUrl.searchParams.get("from");
      const dest =
        from && from.startsWith("/") && !from.startsWith("//") ? from : "/app";
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|media|manifest.webmanifest|sw.js).*)",
  ],
};
