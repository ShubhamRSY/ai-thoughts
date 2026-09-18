import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { authorizeBearer } from "@/lib/cron-auth";
import { collectOwnerMetrics } from "@/lib/owner-metrics";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/owner/metrics — product-owner engagement snapshot.
 * Auth: Authorization: Bearer <OWNER_DASHBOARD_SECRET|CRON_SECRET>
 * Not linked from the public product.
 */
export async function GET(request: Request) {
  if (
    !(await authorizeBearer(request, {
      secrets: [process.env.OWNER_DASHBOARD_SECRET, process.env.CRON_SECRET],
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
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
}
