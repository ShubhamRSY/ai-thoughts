import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { rateLimit, clientIp } from "./rate-limit.ts";

// Every route that guards a privileged action with a Bearer secret
// (admin bootstrap, admin seed, owner metrics, cron) routes through here —
// bounding attempts per IP here protects all of them, present and future,
// instead of relying on each route to remember its own guard.
const BEARER_ATTEMPT_LIMIT = 20;
const BEARER_ATTEMPT_WINDOW_MS = 10 * 60_000;

/**
 * Timing-safe Bearer check for cron / admin seed routes.
 * Production requires CRON_SECRET (or an explicit override secret).
 */
export async function authorizeBearer(
  request: Request | NextRequest,
  opts?: { secrets?: (string | undefined)[]; allowInsecureDev?: boolean }
): Promise<boolean> {
  const { ok: withinAttemptLimit } = await rateLimit(
    `bearer-auth:${clientIp(request as Request)}`,
    BEARER_ATTEMPT_LIMIT,
    BEARER_ATTEMPT_WINDOW_MS
  );
  if (!withinAttemptLimit) return false;

  const candidates = (opts?.secrets ?? [
    process.env.CRON_SECRET,
    process.env.ADMIN_SEED_SECRET,
  ])
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));

  if (candidates.length === 0) {
    // No secret configured → closed, everywhere. `next dev`, self-hosted and
    // staging all look "non-production", so NODE_ENV alone must never open a
    // privileged route (it handed out admin via bootstrap). Running without a
    // secret takes both the route's consent and an explicit local opt-in.
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) return false;
    return opts?.allowInsecureDev === true && process.env.ALLOW_INSECURE_DEV_AUTH === "1";
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

export async function authorizeCron(request: Request | NextRequest): Promise<boolean> {
  return authorizeBearer(request, {
    secrets: [process.env.CRON_SECRET],
    allowInsecureDev: true,
  });
}
