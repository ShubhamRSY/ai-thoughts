import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getPrefs, upsertPrefs } from "@/lib/prefs";
import { reportError } from "@/lib/report-error";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const prefs = await getPrefs(db, session.handle);
    return NextResponse.json({
      ...prefs,
      email: prefs.email || session.email,
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/prefs" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    // Per account; a prefs write touching email/digest/push is a low-volume op.
    const { ok, retryInSec } = await rateLimit(`prefs:${session.id}`, 30, 10 * 60_000);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many preference changes — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }
    const body = await request.json();
    const { db } = await connectToDatabase();
    const prefs = await upsertPrefs(db, session.handle, {
      email: session.email,
      // Patch semantics: only fields the caller sent change. New rows default to
      // off (see upsertPrefs), so nobody is opted into email without choosing it.
      email_digest: body.email_digest === undefined ? undefined : Boolean(body.email_digest),
      weekly_digest: body.weekly_digest === undefined ? undefined : Boolean(body.weekly_digest),
      push_enabled:
        body.push_enabled === undefined ? undefined : Boolean(body.push_enabled),
      onboarded: body.onboarded === undefined ? undefined : Boolean(body.onboarded),
    });
    return NextResponse.json(prefs);
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/prefs" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
