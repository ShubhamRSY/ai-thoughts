import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  createSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { listSessions, revokeAll, revokeOthers, revokeSession } from "@/lib/sessions";

import { reportError } from "@/lib/report-error";
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const sessions = await listSessions(db, session.id, session.sid);
    return NextResponse.json({ current: session.sid ?? null, sessions });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/account/sessions" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** `{ action: "revoke", sid }` | `{ action: "revoke_others" }` | `{ action: "revoke_all" }` */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await request.json();
    const { db } = await connectToDatabase();

    if (body.action === "revoke") {
      const sid = typeof body.sid === "string" ? body.sid : "";
      if (!sid || sid === session.sid) {
        return NextResponse.json(
          { error: "Pick another device, or use sign out for this one" },
          { status: 400 }
        );
      }
      // Scoped to the caller's own sessions: someone else's sid just isn't found.
      if (!(await revokeSession(db, session.id, sid))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "revoke_others") {
      await revokeOthers(db, session.id, session.sid);
      // The account was just stamped, which would also reject this device's cookie
      // (it predates the stamp), so hand it a fresh one.
      const token = await createSession(
        { id: session.id, handle: session.handle, displayName: session.displayName },
        { sid: session.sid, userAgent: request.headers.get("user-agent") }
      );
      const res = NextResponse.json({ ok: true });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
      return res;
    }

    if (body.action === "revoke_all") {
      await revokeAll(db, session.id);
      const res = NextResponse.json({ ok: true });
      res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
      return res;
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/account/sessions" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
