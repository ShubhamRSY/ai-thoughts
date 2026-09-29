import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, clientIp } from "./rate-limit.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("rateLimit allows exactly `limit` hits then blocks the next", async () => {
  const key = `rl-window-${Date.now()}-${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.equal((await rateLimit(key, 3, 60_000)).ok, true);
  const blocked = await rateLimit(key, 3, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryInSec >= 1);
});

test("rateLimit shares a bucket across calls with the same key", async () => {
  const key = `rl-shared-${Date.now()}-${Math.random()}`;
  for (let i = 0; i < 2; i++) assert.equal((await rateLimit(key, 2, 60_000)).ok, true);
  assert.equal((await rateLimit(key, 2, 60_000)).ok, false);
});

test("rateLimit resets after the window expires", async () => {
  const key = `rl-expire-${Date.now()}-${Math.random()}`;
  assert.equal((await rateLimit(key, 1, 60)).ok, true);
  assert.equal((await rateLimit(key, 1, 60)).ok, false);
  await sleep(90);
  assert.equal((await rateLimit(key, 1, 60)).ok, true);
});

test("rateLimit keys are independent", async () => {
  const a = `rl-a-${Date.now()}-${Math.random()}`;
  const b = `rl-b-${Date.now()}-${Math.random()}`;
  assert.equal((await rateLimit(a, 1, 60_000)).ok, true);
  // b untouched by a's spend.
  assert.equal((await rateLimit(b, 2, 60_000)).ok, true);
  assert.equal((await rateLimit(b, 2, 60_000)).ok, true);
});

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const set = (e: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(e)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  set(env);
  try {
    fn();
  } finally {
    set(prev);
  }
}

const req = (headers: Record<string, string>) => new Request("https://example.com", { headers });

test("clientIp ignores forwarding headers when no proxy is trusted", () => {
  withEnv({ VERCEL: undefined, TRUSTED_PROXY_HOPS: undefined }, () => {
    // 40 forged XFF values must all land in one bucket, not 40.
    const ips = new Set(Array.from({ length: 40 }, (_, i) => clientIp(req({ "x-forwarded-for": `10.0.0.${i}` }))));
    assert.deepEqual([...ips], ["unknown"]);
    assert.equal(clientIp(req({ "x-real-ip": "198.51.100.7" })), "unknown");
  });
});

test("clientIp takes the entry the trusted proxy appended, not the client's", () => {
  withEnv({ VERCEL: undefined, TRUSTED_PROXY_HOPS: "1" }, () => {
    assert.equal(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.10" })), "203.0.113.10");
    assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.10" })), "203.0.113.10");
    assert.equal(clientIp(req({})), "unknown");
  });
  withEnv({ VERCEL: undefined, TRUSTED_PROXY_HOPS: "2" }, () => {
    assert.equal(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.10, 10.0.0.1" })), "203.0.113.10");
  });
});

test("clientIp trusts Vercel's overwritten headers", () => {
  withEnv({ VERCEL: "1", TRUSTED_PROXY_HOPS: undefined }, () => {
    assert.equal(clientIp(req({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "198.51.100.7" })), "198.51.100.7");
    assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.10" })), "203.0.113.10");
    assert.equal(clientIp(req({})), "unknown");
  });
});
