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

/** Log once on boot in production if critical env is missing. */
export function warnIfProductionEnvIncomplete(): void {
  if (!isProductionRuntime()) return;
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
