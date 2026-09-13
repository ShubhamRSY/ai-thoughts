import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Timing-safe Bearer check for cron / admin seed routes.
 * Production requires CRON_SECRET (or an explicit override secret).
 */
export function authorizeBearer(
  request: Request | NextRequest,
  opts?: { secrets?: (string | undefined)[]; allowInsecureDev?: boolean }
): boolean {
  const candidates = (opts?.secrets ?? [
    process.env.CRON_SECRET,
    process.env.ADMIN_SEED_SECRET,
  ])
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));

  if (candidates.length === 0) {
    // Never open cron in production without a secret.
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
      return false;
    }
    return opts?.allowInsecureDev !== false;
  }

  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!bearer) return false;

  try {
    const a = Buffer.from(bearer, "utf8");
    for (const secret of candidates) {
      const b = Buffer.from(secret, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function authorizeCron(request: Request | NextRequest): boolean {
  return authorizeBearer(request, {
    secrets: [process.env.CRON_SECRET],
    allowInsecureDev: true,
  });
}
