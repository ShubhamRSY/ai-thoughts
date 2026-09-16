"use client";

/** Show translate only when we know the language and it isn't English. */
export function shouldOfferTranslate(language?: string | null): boolean {
  if (!language) return false;
  const base = language.trim().toLowerCase().split(/[-_]/)[0];
  return Boolean(base) && base !== "en";
}
