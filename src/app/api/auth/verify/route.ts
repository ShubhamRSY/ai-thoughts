import { NextResponse } from "next/server";
import {
  findOrCreateUser,
  createSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { verifyAndConsumeOtp } from "@/lib/otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getSiteSettings } from "@/lib/admin";
import { connectToDatabase } from "@/lib/mongodb";
import { hashEmail } from "@/lib/secure";

const VERIFY_LIMIT = 20;
const VERIFY_WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  try {
    const existing = await getSession();
    if (existing) {
      const token = await createSession({
        id: existing.id,
        handle: existing.handle,
        displayName: existing.displayName,
      });
      const res = NextResponse.json({
        ok: true,
        alreadySignedIn: true,
        user: existing,
      });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
      return res;
    }

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

    // invitesOpen gates brand-new accounts; returning members can still finish OTP.
    const settings = await getSiteSettings();
    if (!settings.invitesOpen) {
      try {
        const { db } = await connectToDatabase();
        const found = await db.collection("users").findOne({
          $or: [{ emailHash: hashEmail(normalized) }, { email: normalized }],
        });
        if (!found) {
          return NextResponse.json(
            {
              error: "New sign-ups are paused right now. Try again later.",
              code: "invites_closed",
            },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          {
            error: "New sign-ups are paused right now. Try again later.",
            code: "invites_closed",
          },
          { status: 403 }
        );
      }
    }

    let user;
    try {
      user = await findOrCreateUser(normalized, result.displayName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create account";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const token = await createSession(user);

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
