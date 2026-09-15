import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { generateOtpCode, storeOtp } from "@/lib/otp";
import { EmailDeliveryError, sendOtpEmail } from "@/lib/email";
import { getSession } from "@/lib/auth";
import { checkDisposableEmail, checkDisplayNameAllowed } from "@/lib/anti-abuse";
import { getSiteSettings } from "@/lib/admin";

const SIGN_IN_LIMIT = 8;
const SIGN_IN_WINDOW_MS = 15 * 60_000;
const EMAIL_OTP_LIMIT = 3;
const EMAIL_OTP_WINDOW_MS = 15 * 60_000;
const GLOBAL_OTP_LIMIT = 40;
const GLOBAL_OTP_WINDOW_MS = 60 * 60_000;

export async function POST(request: Request) {
  try {
    const existing = await getSession();
    if (existing) {
      return NextResponse.json({
        ok: true,
        alreadySignedIn: true,
        user: existing,
        message: "You’re already signed in",
      });
    }

    const settings = await getSiteSettings();
    if (!settings.invitesOpen) {
      return NextResponse.json(
        {
          error: "New sign-ups are paused right now. Try again later.",
          code: "invites_closed",
        },
        { status: 403 }
      );
    }

    const ip = clientIp(request);
    const { ok, retryInSec } = rateLimit(`sign-in:${ip}`, SIGN_IN_LIMIT, SIGN_IN_WINDOW_MS);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many attempts — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const { ok: globalOk, retryInSec: globalRetry } = rateLimit(
      "sign-in:global",
      GLOBAL_OTP_LIMIT,
      GLOBAL_OTP_WINDOW_MS
    );
    if (!globalOk) {
      return NextResponse.json(
        { error: "Sign-in is temporarily busy — try again soon", retry_in_sec: globalRetry },
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
    const disposable = checkDisposableEmail(normalized);
    if (!disposable.ok) {
      return NextResponse.json({ error: disposable.reason, code: disposable.code }, { status: 400 });
    }

    const { ok: emailOk, retryInSec: emailRetry } = rateLimit(
      `sign-in-email:${normalized}`,
      EMAIL_OTP_LIMIT,
      EMAIL_OTP_WINDOW_MS
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

    const nameCheck = checkDisplayNameAllowed(name);
    if (!nameCheck.ok) {
      return NextResponse.json({ error: nameCheck.reason, code: nameCheck.code }, { status: 400 });
    }

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
