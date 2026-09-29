/**
 * The in-site path to send someone to after sign-in, or `fallback`.
 * Resolving it is the only reliable check: browsers read "\" as "/", so a
 * string test like `startsWith("/") && !startsWith("//")` let "/\evil.com"
 * through as an open redirect to evil.com.
 */
export function safeRedirectPath(from: string | null | undefined, fallback = "/app"): string {
  if (!from || !from.startsWith("/")) return fallback;
  const base = "http://same.invalid";
  try {
    const u = new URL(from, base);
    return u.origin === base ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}
