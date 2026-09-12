import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  deleteUserAccount,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * DELETE /api/account — self-serve account wipe for the signed-in user.
 * Body optional: { confirm: "DELETE" } required.
 */
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const ip = clientIp(request);
    const { ok, retryInSec } = rateLimit(`account-delete:${ip}`, 5, 60 * 60_000);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many attempts — try again later", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    let confirm = "";
    try {
      const body = (await request.json()) as { confirm?: string };
      confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";
    } catch {
      confirm = "";
    }
    if (confirm !== "DELETE") {
      return NextResponse.json(
        { error: 'Send { "confirm": "DELETE" } to wipe your account' },
        { status: 400 }
      );
    }

    await deleteUserAccount(session);
    await clearSessionCookie();

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
    return res;
  } catch (e) {
    console.error("account delete error:", e);
    return NextResponse.json({ error: "Could not delete account" }, { status: 500 });
  }
}
