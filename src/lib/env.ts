/**
 * Production env presence checks (never log secret values).
 */

const REQUIRED_PROD = [
  "AUTH_SECRET",
  "MONGODB_URL",
  "CRON_SECRET",
] as const;

const RECOMMENDED_PROD = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_PRIVATE_READ_WRITE_TOKEN",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
] as const;

function present(name: string): boolean {
  if (name === "MONGODB_URL") {
    return Boolean(
      process.env.MONGODB_URL?.trim() || process.env.MONGODB_URI?.trim()
    );
  }
  if (name === "AUTH_SECRET") {
    return Boolean(
      process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()
    );
  }
  return Boolean(process.env[name]?.trim());
}

export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

export function envStatus(): {
  ok: boolean;
  missingRequired: string[];
  missingRecommended: string[];
} {
  const missingRequired = REQUIRED_PROD.filter((k) => !present(k));
  const missingRecommended = RECOMMENDED_PROD.filter((k) => !present(k));
  return {
    ok: missingRequired.length === 0,
    missingRequired: [...missingRequired],
    missingRecommended: [...missingRecommended],
  };
}

/**
 * Break-glass admins, by user id (ObjectId hex), comma/space separated.
 * Ids, not handles: a handle can be renamed away and registered by someone
 * else, who would then inherit admin.
 */
export function parseAdminUserIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f]{24}$/.test(s));
}

/** Log once on boot in production if critical env is missing. */
export function warnIfProductionEnvIncomplete(): void {
  if (process.env.ADMIN_HANDLES?.trim()) {
    console.error(
      "[ai-thoughts] ADMIN_HANDLES is no longer honored (handles can be re-registered by someone else). " +
        "Set ADMIN_USER_IDS to the admins' user ids instead — shown at /api/auth/me when signed in."
    );
  }
  if (!isProductionRuntime()) return;
  // Same pairs lib/rate-limit.ts reads (URL and token may come from either).
  const upstash =
    Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim()) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim());
  if (!upstash) {
    console.error(
      "[ai-thoughts] Rate limits are per server instance: Upstash is not configured. " +
        "Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN) " +
        "so sign-in and abuse limits hold across instances."
    );
  }
  const status = envStatus();
  if (!status.ok) {
    console.error(
      "[ai-thoughts] Missing required production env:",
      status.missingRequired.join(", ")
    );
  } else if (status.missingRecommended.length) {
    console.warn(
      "[ai-thoughts] Missing recommended env:",
      status.missingRecommended.join(", ")
    );
  }
}
