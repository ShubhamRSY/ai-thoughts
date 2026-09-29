import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { envStatus, isProductionRuntime } from "@/lib/env";
import { isMongoConfigured, connectToDatabase } from "@/lib/mongodb";
import { ensureCoreIndexes } from "@/lib/indexes";

import { reportError } from "@/lib/report-error";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — uptime + config presence (no secrets).
 * Returns 503 when production is missing required env, or Mongo ping fails.
 *
 * Detail (missing env key NAMES, index state) is only returned when the caller
 * presents a configured Bearer secret, so an anonymous uptime probe sees the
 * health state but can't glean deployment internals (e.g. which env vars are
 * absent lets an attacker tailor a supply-chain or env-confusion attack).
 */
function hasSecret(request: Request): boolean {
  const secrets = [
    process.env.OWNER_DASHBOARD_SECRET,
    process.env.CRON_SECRET,
    process.env.ADMIN_SEED_SECRET,
  ]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (secrets.length === 0) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!bearer) return false;

  try {
    const a = Buffer.from(bearer, "utf8");
    return secrets.some((s) => {
      const b = Buffer.from(s, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    });
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
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
        reportError(e, { route: "api/health", service: "mongodb" });
        indexes = "error";
      }
    } catch (e) {
      console.error("health mongo ping failed:", e);
      reportError(e, { route: "api/health", service: "mongodb" });
      mongo = "error";
    }
  } else if (isProductionRuntime()) {
    mongo = "error";
  }

  const healthy =
    env.ok &&
    mongo !== "error" &&
    (!isProductionRuntime() || mongo === "ok");

  const authorized = hasSecret(request);

  return NextResponse.json(
    {
      ok: healthy,
      service: "ai-thoughts",
      time: new Date().toISOString(),
      env: {
        ok: env.ok,
        // Only an authorized caller sees which specific names are missing;
        // probes/rogue clients just see the aggregate ok/not-ok flag.
        ...(authorized
          ? {
              missing_required: env.missingRequired,
              missing_recommended: env.missingRecommended,
            }
          : {}),
      },
      mongo,
      ...(authorized ? { indexes } : {}),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
