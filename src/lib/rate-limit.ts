import { Redis } from "@upstash/redis";

// Shared, multi-instance-safe limiter when Upstash is configured (free tier
// works fine — https://upstash.com). Falls back to the in-memory limiter
// below with zero config, so nothing breaks for anyone who hasn't set it up.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export function isDistributedRateLimitConfigured(): boolean {
  return redis !== null;
}

async function rateLimitRedis(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryInSec: number }> {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const redisKey = `rl:${key}`;
  try {
    const pipeline = redis!.pipeline();
    pipeline.incr(redisKey);
    pipeline.ttl(redisKey);
    const [count, ttl] = (await pipeline.exec()) as [number, number];

    // First hit in this window (or the key expired mid-race) — arm the TTL.
    if (count === 1 || ttl < 0) {
      await redis!.expire(redisKey, windowSec);
    }

    if (count > limit) {
      return { ok: false, retryInSec: ttl > 0 ? ttl : windowSec };
    }
    return { ok: true, retryInSec: 0 };
  } catch (e) {
    // Upstash hiccup — fail open. Availability beats strict limiting here,
    // and the in-memory limiter isn't a fallback mid-request (state isn't
    // shared), so this is the safest default.
    console.error("redis rate limit failed, failing open:", e);
    return { ok: true, retryInSec: 0 };
  }
}

// Best-effort in-memory rate limiter, keyed per process. Used automatically
// when Upstash isn't configured.
//
// Caveat: on serverless (Vercel), each function instance has its own memory,
// there is no shared state across concurrent instances or cold starts, so
// this does NOT provide a hard guarantee under distributed load. It still
// meaningfully raises the bar for casual/scripted abuse hitting a warm
// instance, and is fully effective for a single long-running server (e.g.
// `next start` on one machine). Set UPSTASH_REDIS_REST_URL/TOKEN for a hard
// guarantee across instances.
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

function rateLimitMemory(
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

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryInSec: number }> {
  if (redis) return rateLimitRedis(key, limit, windowMs);
  return rateLimitMemory(key, limit, windowMs);
}

/**
 * The caller's IP, for rate-limit keys and audit logs. Forwarding headers are
 * client-writable, so they're honored only where a known proxy set them:
 * - Vercel: the edge overwrites x-real-ip / x-forwarded-for, so they're the peer.
 * - Self-hosted behind your own proxies: set TRUSTED_PROXY_HOPS to how many
 *   append to X-Forwarded-For (nginx `proxy_add_x_forwarded_for` = 1 per hop);
 *   the entry that many from the right is the one the outermost proxy saw.
 * Otherwise (bare `next start`, `next dev`) Next only fills X-Forwarded-For
 * from the socket when the client didn't send one, so the header can't be told
 * apart from a forgery and is ignored: every caller shares the "unknown"
 * bucket. That fails closed (limits still bite) instead of letting one client
 * mint a fresh bucket per request.
 */
export function clientIp(request: Request): string {
  const h = request.headers;
  if (process.env.VERCEL) {
    return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  }
  const hops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  if (!(hops > 0)) return "unknown";
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Fewer entries than hops means the request skipped a proxy — its leftmost is
  // still the closest thing to the peer we have, and it's not client-appendable.
  return chain[Math.max(0, chain.length - hops)] ?? "unknown";
}
