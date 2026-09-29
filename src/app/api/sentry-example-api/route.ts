// TEMPORARY — confirms server errors reach Sentry. Delete with
// src/app/sentry-example-page once verified.
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";

export async function GET(request: Request) {
  // Public URL — don't let it burn the Sentry event quota.
  const { ok } = await rateLimit(`sentry-example:${clientIp(request)}`, 5, 60_000);
  if (!ok) return NextResponse.json({ error: "Slow down" }, { status: 429 });

  // Caught and reported exactly like the real routes' catch blocks. (An
  // uncaught throw gets an unterminated 500 that browsers retry several times.)
  try {
    throw new Error("Sentry example: server error");
  } catch (e) {
    reportError(e, { route: "api/sentry-example-api" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
