import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, setRedisForTests } from "./rate-limit.ts";
import { warnIfProductionEnvIncomplete } from "./env.ts";

// SECURITY_AUDIT.md M1: an unreachable Upstash must not switch rate limits off.

type Fake = Parameters<typeof setRedisForTests>[0];

/** A Redis whose pipeline fails, hangs, or counts like the real thing. */
function fakeRedis(mode: "fail" | "hang" | "ok"): Fake {
  const counts = new Map<string, number>();
  return {
    pipeline() {
      const ops: string[] = [];
      const p = {
        incr(k: string) {
          ops.push(k);
          return p;
        },
        ttl() {
          return p;
        },
        exec() {
          if (mode === "fail") return Promise.reject(new Error("ECONNREFUSED"));
          if (mode === "hang") return new Promise(() => {});
          const k = ops[0];
          counts.set(k, (counts.get(k) ?? 0) + 1);
          return Promise.resolve([counts.get(k), 60]);
        },
      };
      return p;
    },
    expire: () => Promise.resolve(1),
  } as unknown as Fake;
}

const key = (prefix: string) => `${prefix}:${Date.now()}-${Math.random()}`;

afterEach(() => setRedisForTests(null));

describe("rate limiting when Upstash is down (M1)", () => {
  it("fails closed for sign-in, bearer secrets and account deletion", async () => {
    setRedisForTests(fakeRedis("fail"));
    for (const k of [key("sign-in"), key("sign-in-email"), "sign-in:global", key("bearer-auth"), key("account-delete")]) {
      const r = await rateLimit(k, 100, 60_000);
      assert.equal(r.ok, false, k);
      assert.equal(r.unavailable, true, k);
    }
  });

  it("falls back to this instance's memory at half the limit for everything else", async () => {
    setRedisForTests(fakeRedis("fail"));
    for (const prefix of ["verify", "post", "upload", "translate"]) {
      const k = key(prefix);
      for (let i = 0; i < 5; i++) assert.equal((await rateLimit(k, 10, 60_000)).ok, true, `${prefix} #${i + 1}`);
      const sixth = await rateLimit(k, 10, 60_000);
      assert.equal(sixth.ok, false, `${prefix} is capped at 5 of 10`);
      assert.equal(sixth.unavailable, undefined);
    }
  });

  it("treats a hanging Redis as down after the timeout instead of stalling", async () => {
    setRedisForTests(fakeRedis("hang"));
    const started = Date.now();
    const r = await rateLimit(key("sign-in"), 100, 60_000);
    assert.equal(r.unavailable, true);
    assert.ok(Date.now() - started < 3_000);
  });

  it("uses Redis normally when it answers", async () => {
    setRedisForTests(fakeRedis("ok"));
    const k = key("sign-in");
    assert.equal((await rateLimit(k, 2, 60_000)).ok, true);
    assert.equal((await rateLimit(k, 2, 60_000)).ok, true);
    const third = await rateLimit(k, 2, 60_000);
    assert.equal(third.ok, false);
    assert.equal(third.unavailable, undefined);
  });
});

describe("startup warning (M1)", () => {
  const vars = ["NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"];
  const logs = (env: Record<string, string>) => {
    const saved = Object.fromEntries(vars.map((v) => [v, process.env[v]]));
    const orig = console.error;
    const lines: string[] = [];
    console.error = (...a: unknown[]) => void lines.push(a.join(" "));
    try {
      for (const v of vars) delete process.env[v];
      Object.assign(process.env, env);
      warnIfProductionEnvIncomplete();
    } finally {
      console.error = orig;
      for (const v of vars) {
        if (saved[v] === undefined) delete process.env[v];
        else process.env[v] = saved[v];
      }
    }
    return lines.some((l) => l.includes("Upstash is not configured"));
  };

  it("warns in production without Upstash", () => {
    assert.equal(logs({ NODE_ENV: "production" }), true);
  });
  it("is quiet when either variable pair is set, or outside production", () => {
    assert.equal(logs({ NODE_ENV: "production", KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t" }), false);
    assert.equal(logs({ NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://x", KV_REST_API_TOKEN: "t" }), false);
    assert.equal(logs({ NODE_ENV: "development" }), false);
  });
});
