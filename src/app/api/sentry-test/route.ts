// TEMPORARY — confirms errors reach Sentry. Delete this folder once verified.
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";

export async function GET(request: Request) {
  // Anyone can hit this, so don't let it burn the Sentry event quota.
  const { ok } = await rateLimit(`sentry-test:${clientIp(request)}`, 5, 60_000);
  if (!ok) return NextResponse.json({ error: "Slow down" }, { status: 429 });

  // ?mode=throw: an uncaught error, reported by instrumentation's onRequestError.
  if (new URL(request.url).searchParams.get("mode") === "throw") {
    throw new Error("Sentry test: uncaught route error");
  }

  // Default: a handled error, reported by reportError like the real catch blocks.
  try {
    throw new Error("Sentry test: handled error via reportError");
  } catch (e) {
    reportError(e, { route: "api/sentry-test" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
