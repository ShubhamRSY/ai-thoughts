import { NextResponse } from "next/server";
import {
  createSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

/**
 * GET /api/auth/me — current user.
 * Also slides the session cookie forward so closing/reopening the app
 * does not force another email OTP while the session is still valid.
 */
export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const token = await createSession({
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
  });

  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
