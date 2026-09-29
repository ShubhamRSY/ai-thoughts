/** Canonical public site URL used for metadata, emails, and sitemaps. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

/** Public contact address (safe to expose in the client). */
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "keepers@aito.social";

/** Fixed legal "last updated" date — do not use `new Date()` at render time. */
export const LEGAL_UPDATED = "September 28, 2026";
export const PRIVACY_UPDATED = "September 29, 2026";
