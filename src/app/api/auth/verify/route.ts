import { NextResponse, after } from "next/server";
import { sendSignInAlertEmail } from "@/lib/email";
import {
  findOrCreateUser,
  createSession,
  createSessionActionToken,
  getSession,
  verifySessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  MIN_AGE,
} from "@/lib/auth";
import { verifyAndConsumeOtp } from "@/lib/otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getSiteSettings } from "@/lib/admin";
import { connectToDatabase } from "@/lib/mongodb";
import { hashEmail } from "@/lib/secure";
import { upsertPrefs } from "@/lib/prefs";
import { reportError } from "@/lib/report-error";
import { describeDevice } from "@/lib/device";
import { getSiteUrl } from "@/lib/site";
import { isNewDevice } from "@/lib/sessions";
import { notifyNewSignIn } from "@/lib/activity";

const VERIFY_LIMIT = 20;
const VERIFY_WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  try {
    const existing = await getSession();
    if (existing) {
      const token = await createSession(
        {
          id: existing.id,
          handle: existing.handle,
          displayName: existing.displayName,
        },
        { sid: existing.sid, userAgent: request.headers.get("user-agent") }
      );
      const res = NextResponse.json({
        ok: true,
        alreadySignedIn: true,
        user: existing,
      });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
      return res;
    }

    const ip = clientIp(request);
    const { ok, retryInSec } = await rateLimit(`verify:${ip}`, VERIFY_LIMIT, VERIFY_WINDOW_MS);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many attempts — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, code, age_confirmed } = body as { email?: string; code?: string; age_confirmed?: unknown };

    // No account and no session without an explicit adult confirmation; the
    // time of it is stored on the user (findOrCreateUser).
    if (age_confirmed !== true) {
      return NextResponse.json(
        { error: `AiTo is for people ${MIN_AGE} and older. Confirm your age to continue.`, code: "age_required" },
        { status: 400 }
      );
    }

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
    let createdNew = false;
    try {
      ({ user, createdNew } = await findOrCreateUser(
        normalized,
        result.displayName,
        result.handle
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create account";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Fresh accounts get an onboarding prefs row so the guided first-take
    // wizard shows once; returning members already have rows (or none).
    if (createdNew) {
      try {
        const { db } = await connectToDatabase();
        await upsertPrefs(db, user.handle, { onboarded: false });
      } catch (e) {
        // Non-fatal — the wizard simply won't show if the write failed.
        reportError(e, { route: "api/auth/verify", service: "mongodb" });
      }
    }

    const userAgent = request.headers.get("user-agent");
    const deviceLabel = describeDevice(userAgent);

    // Judged before createSession writes this sign-in's row, so a returning
    // member on a device they have used before stays quiet. Alerting on every
    // sign-in trains people to ignore the one email that matters.
    let newDevice = false;
    if (!createdNew) {
      try {
        const { db } = await connectToDatabase();
        newDevice = await isNewDevice(db, String(user._id), userAgent);
      } catch (e) {
        // Failing open (no alert) beats failing the sign-in.
        reportError(e, { route: "api/auth/verify", service: "mongodb" });
      }
    }

    const token = await createSession(user, { userAgent });

    if (newDevice) {
      const userId = String(user._id);
      // The freshly-minted sid is inside the cookie we just built; read it back so
      // the email can offer to end exactly this device.
      const sid = (await verifySessionToken(token))?.sid;
      after(async () => {
        const { db } = await connectToDatabase();
        try {
          await notifyNewSignIn(db, {
            handle: user.handle,
            displayName: user.displayName,
            deviceLabel,
          });
          const revokeUrl = sid
            ? `${getSiteUrl()}/api/account/sessions/revoke?token=${await createSessionActionToken({
                userId,
                sid,
              })}`
            : undefined;
          await sendSignInAlertEmail(normalized, deviceLabel, revokeUrl);
        } catch (e) {
          console.error("new-device notice failed:", e);
          reportError(e, { route: "api/auth/verify", service: "resend" });
        }
      });
    }

    const res = NextResponse.json({
      ok: true,
      isNew: createdNew,
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
    reportError(e, { route: "api/auth/verify" });
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
