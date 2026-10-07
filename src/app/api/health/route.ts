import { NextResponse } from "next/server";
import { envStatus, isProductionRuntime } from "@/lib/env";
import { isMongoConfigured, connectToDatabase } from "@/lib/mongodb";
import { ensureCoreIndexes } from "@/lib/indexes";
import { reportError } from "@/lib/report-error";
import { authorizeBearer } from "@/lib/cron-auth";

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
/**
 * Same Bearer check as cron/admin routes, attempt-limited per IP (L2) — but
 * only when a secret is offered, so plain uptime probes don't spend the IP's
 * attempt budget.
 */
function hasSecret(request: Request): Promise<boolean> {
  if (!request.headers.get("authorization")) return Promise.resolve(false);
  return authorizeBearer(request, {
    secrets: [process.env.OWNER_DASHBOARD_SECRET, process.env.CRON_SECRET, process.env.ADMIN_SEED_SECRET],
    allowInsecureDev: false,
  });
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

  const authorized = await hasSecret(request);

  // Newest verified backup on the private store, so an authorized caller can
  // spot a cron that silently stopped (RUNBOOK: "a silent backup is worse than
  // none"). Metadata only — never a URL/path that opens the archive.
  let backup: { age_seconds: number; taken_label: string } | undefined;
  if (authorized && (process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN)) {
    try {
      const { list } = await import("@vercel/blob");
      const token =
        process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
      const existing = (await list({ prefix: "backups/", token })) as {
        blobs?: Array<{ uploadedAt?: Date | string }>;
      };
      const newest = (existing.blobs ?? [])
        .map((b) => new Date(b.uploadedAt ?? 0).getTime())
        .filter((t) => t > 0)
        .sort((a, b) => b - a)[0];
      if (newest) {
        backup = {
          age_seconds: Math.max(0, Math.floor((Date.now() - newest) / 1000)),
          taken_label: new Date(newest).toISOString(),
        };
      }
    } catch (e) {
      // The health check must never go red because backup metadata won't load.
      reportError(e, { route: "api/health", service: "blob" });
    }
  }

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
      ...(authorized
        ? {
            indexes,
            backup,
          }
        : {}),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
