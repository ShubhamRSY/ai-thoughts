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

test("clientIp prefers the first X-Forwarded-For hop", () => {
  const req = new Request("https://example.com", {
    headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
  });
  assert.equal(clientIp(req), "203.0.113.10");
});

test("clientIp falls back to x-real-ip then unknown", () => {
  const r1 = new Request("https://example.com", { headers: { "x-real-ip": "198.51.100.7" } });
  assert.equal(clientIp(r1), "198.51.100.7");
  assert.equal(clientIp(new Request("https://example.com")), "unknown");
});