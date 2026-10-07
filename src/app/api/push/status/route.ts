import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getPushStatus } from "@/lib/push";
import { reportError } from "@/lib/report-error";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Health of this account's push channel: how many devices are really
 * registered, and whether the caller is one of them. The client passes the
 * endpoint it holds (or null if it holds none) so we can say "not on this
 * device" without putting those URLs into a query string.
 *
 * Answers the question the settings screen couldn't: not "did you turn push
 * on", but "will you be pushed to".
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { ok: withinLimit, retryInSec } = await rateLimit(`push-status:${session.id}`, 60, 60_000);
    if (!withinLimit) {
      return NextResponse.json({ error: "Too many requests", retry_in_sec: retryInSec }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    // Absent/null is a valid answer: "I have no subscription in this browser".
    const endpoint = typeof body.endpoint === "string" && body.endpoint ? body.endpoint : null;

    const { db } = await connectToDatabase();
    const status = await getPushStatus(db, session.handle, endpoint);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/push/status" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
