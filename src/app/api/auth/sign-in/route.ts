import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { generateOtpCode, storeOtp } from "@/lib/otp";
import { EmailDeliveryError, sendOtpEmail } from "@/lib/email";

const SIGN_IN_LIMIT = 5;
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

    const normalized = email.toLowerCase().trim();
    const { ok: emailOk, retryInSec: emailRetry } = rateLimit(
      `sign-in-email:${normalized}`,
      3,
      SIGN_IN_WINDOW_MS
    );
    if (!emailOk) {
      return NextResponse.json(
        { error: "Too many codes for this email — try again shortly", retry_in_sec: emailRetry },
        { status: 429 }
      );
    }

    const name =
      displayName && typeof displayName === "string" && displayName.trim()
        ? displayName.trim().slice(0, 80)
        : normalized.split("@")[0].slice(0, 80);

    const code = generateOtpCode();
    await storeOtp(normalized, code, name);
    await sendOtpEmail(normalized, code);

    const payload: {
      ok: true;
      sent: true;
      message: string;
      devCode?: string;
    } = {
      ok: true,
      sent: true,
      message: "Check your email for a 6-digit code",
    };

    // Only expose the code in local/dev when Resend isn't configured —
    // never in production.
    if (process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY) {
      payload.devCode = code;
    }

    return NextResponse.json(payload);
  } catch (e) {
    console.error("sign-in error:", e);
    if (e instanceof EmailDeliveryError) {
      const status = e.code === "not_configured" || e.code === "test_domain" ? 503 : 502;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json({ error: "Could not send sign-in code" }, { status: 500 });
  }
}
