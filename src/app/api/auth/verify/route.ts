import { NextResponse } from "next/server";
import {
  findOrCreateUser,
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { verifyAndConsumeOtp } from "@/lib/otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const VERIFY_LIMIT = 20;
const VERIFY_WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryInSec } = rateLimit(`verify:${ip}`, VERIFY_LIMIT, VERIFY_WINDOW_MS);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many attempts — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, code } = body as { email?: string; code?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
      return NextResponse.json({ error: "Enter the 6-digit code" }, { status: 400 });
    }

    const result = await verifyAndConsumeOtp(email, code);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const normalized = email.toLowerCase().trim();
    const user = await findOrCreateUser(normalized, result.displayName);
    const token = await createSession(user);

    // Set cookie on the response itself — cookies() alone can drop Set-Cookie
    // when returning NextResponse.json() from a route handler.
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user._id?.toString(),
        email: normalized,
        handle: user.handle,
        displayName: user.displayName,
      },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    console.error("verify error:", e);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
