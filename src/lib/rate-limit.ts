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

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
