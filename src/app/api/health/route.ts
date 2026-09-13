import { NextResponse } from "next/server";
import { envStatus, isProductionRuntime } from "@/lib/env";
import { isMongoConfigured, connectToDatabase } from "@/lib/mongodb";
import { ensureCoreIndexes } from "@/lib/indexes";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — uptime + config presence (no secrets).
 * Returns 503 when production is missing required env, or Mongo ping fails.
 */
export async function GET() {
  const env = envStatus();
  let mongo: "ok" | "skip" | "error" = "skip";
  let indexes: "ok" | "skip" | "error" = "skip";

  if (isMongoConfigured()) {
    try {
      const { db } = await connectToDatabase();
      await db.command({ ping: 1 });
      mongo = "ok";
      try {
        await ensureCoreIndexes(db);
        indexes = "ok";
      } catch (e) {
        console.error("index ensure failed:", e);
        indexes = "error";
      }
    } catch (e) {
      console.error("health mongo ping failed:", e);
      mongo = "error";
    }
  } else if (isProductionRuntime()) {
    mongo = "error";
  }

  const healthy =
    env.ok &&
    mongo !== "error" &&
    (!isProductionRuntime() || mongo === "ok");

  return NextResponse.json(
    {
      ok: healthy,
      service: "ai-thoughts",
      time: new Date().toISOString(),
      env: {
        ok: env.ok,
        missing_required: env.missingRequired,
        missing_recommended: env.missingRecommended,
      },
      mongo,
      indexes,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
