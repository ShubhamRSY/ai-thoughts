"use client";

/** Show translate when language is set and not English, or when unknown (opt-in). */
export function shouldOfferTranslate(language?: string | null): boolean {
  if (!language) return true;
  const base = language.trim().toLowerCase().split(/[-_]/)[0];
  return base !== "en";
}
