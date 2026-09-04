// Best-effort in-memory rate limiter, keyed per process.
//
// Caveat: on serverless (Vercel), each function instance has its own memory,
// there is no shared state across concurrent instances or cold starts, so
// this does NOT provide a hard guarantee under distributed load. It still
// meaningfully raises the bar for casual/scripted abuse hitting a warm
// instance, and is fully effective for a single long-running server (e.g.
// `next start` on one machine). For a hard guarantee in a multi-instance
// deployment, back this with a shared store (e.g. Upstash Redis).
const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodically forget old buckets so this map can't grow unbounded.
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryInSec: number } {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryInSec: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryInSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, retryInSec: 0 };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
