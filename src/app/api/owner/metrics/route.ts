import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { authorizeBearer } from "@/lib/cron-auth";
import { collectOwnerMetrics } from "@/lib/owner-metrics";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/owner/metrics — product-owner engagement snapshot.
 * Auth: Authorization: Bearer <OWNER_DASHBOARD_SECRET>. Its own secret, with
 * no fallback to CRON_SECRET (L7): /owner keeps the secret in the browser's
 * sessionStorage, where a page bug could expose it — and CRON_SECRET also
 * unlocks backups, seeding and admin bootstrap.
 * Not linked from the public product.
 */
export async function GET(request: Request) {
  if (
    !(await authorizeBearer(request, {
      secrets: [process.env.OWNER_DASHBOARD_SECRET],
      allowInsecureDev: false,
    }))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(request);
  const { ok, retryInSec } = await rateLimit(`owner-metrics:${ip}`, 30, 60_000);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests", retry_in_sec: retryInSec },
      { status: 429 }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const metrics = await collectOwnerMetrics(db);
    return NextResponse.json(metrics, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("owner metrics:", e);
    reportError(e, { route: "api/owner/metrics" });
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
}
