import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { generateOtpCode, storeOtp } from "@/lib/otp";
import { EmailDeliveryError, sendOtpEmail } from "@/lib/email";

const SIGN_IN_LIMIT = 5;
const SIGN_IN_WINDOW_MS = 10 * 60_000;

function inviteMatches(provided?: string): boolean {
  const expected = process.env.BETA_INVITE_CODE?.trim();
  if (!expected || !provided) return false;
  return provided.trim() === expected;
}

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
    const { email, displayName, invite } = body as {
      email?: string;
      displayName?: string;
      invite?: string;
    };

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

    const betaInvite = inviteMatches(invite);
    let emailed = false;

    if (!betaInvite) {
      await sendOtpEmail(normalized, code);
      emailed = true;
    } else {
      // Invite unlock: skip flaky test-domain email and show the code in-app.
      try {
        await sendOtpEmail(normalized, code);
        emailed = true;
      } catch (e) {
        console.warn("beta invite: email skipped/failed, using on-screen code", e);
      }
    }

    const payload: {
      ok: true;
      sent: true;
      message: string;
      devCode?: string;
      emailed?: boolean;
    } = {
      ok: true,
      sent: true,
      message: emailed
        ? "Check your email for a 6-digit code"
        : "Use the on-screen code to continue (email delivery is limited during beta)",
      emailed,
    };

    // Local/dev without Resend, or beta invite when email couldn't be relied on
    if (
      (process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY) ||
      (betaInvite && !emailed)
    ) {
      payload.devCode = code;
    }
    // Always surface code for valid beta invite so friends can join tonight
    if (betaInvite) {
      payload.devCode = code;
      payload.message = emailed
        ? "Code emailed — also shown below in case it is delayed"
        : "Email isn’t open to everyone yet — use the code below";
    }

    return NextResponse.json(payload);
  } catch (e) {
    console.error("sign-in error:", e);
    if (e instanceof EmailDeliveryError) {
      const status = e.code === "not_configured" || e.code === "test_domain" ? 503 : 502;
      const hint =
        e.code === "test_domain"
          ? " If you were given a beta invite code, enter it on the join form and try again."
          : "";
      return NextResponse.json({ error: `${e.message}${hint}`, code: e.code }, { status });
    }
    return NextResponse.json({ error: "Could not send sign-in code" }, { status: 500 });
  }
}
