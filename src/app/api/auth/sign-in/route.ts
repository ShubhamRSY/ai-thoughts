import { NextResponse } from "next/server";
import { findOrCreateUser, createSession, setSessionCookie } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const SIGN_IN_LIMIT = 8;
const SIGN_IN_WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryInSec } = rateLimit(`sign-in:${ip}`, SIGN_IN_LIMIT, SIGN_IN_WINDOW_MS);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many attempts — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, displayName } = body as { email?: string; displayName?: string };

    if (!email || typeof email !== "string" || email.length > 254) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const name = (displayName && typeof displayName === "string" && displayName.trim())
      ? displayName.trim().slice(0, 80)
      : email.split("@")[0].slice(0, 80);

    const user = await findOrCreateUser(email, name);
    const token = await createSession(user);
    await setSessionCookie(token);

    return NextResponse.json({
      ok: true,
      user: {
        id: user._id?.toString(),
        email: user.email,
        handle: user.handle,
        displayName: user.displayName,
      },
    });
  } catch (e) {
    console.error("sign-in error:", e);
    return NextResponse.json({ error: "Sign in failed" }, { status: 500 });
  }
}
