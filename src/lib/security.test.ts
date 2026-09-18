import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { rateLimit } from "./rate-limit.ts";
import { authorizeBearer } from "./cron-auth.ts";
import { envStatus } from "./env.ts";
import {
  encryptEmail,
  decryptEmail,
  hashEmail,
  timingSafeEqualStr,
} from "./secure.ts";
import { isSafePushEndpoint } from "./push.ts";

describe("timingSafeEqualStr", () => {
  it("matches equal strings", () => {
    assert.equal(timingSafeEqualStr("abc", "abc"), true);
  });
  it("rejects different strings", () => {
    assert.equal(timingSafeEqualStr("abc", "abd"), false);
    assert.equal(timingSafeEqualStr("abc", "ab"), false);
  });
});

describe("email crypto", () => {
  const prev = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-for-unit-tests-only-32b";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = prev;
  });

  it("hashes stably", () => {
    assert.equal(hashEmail("A@B.com"), hashEmail("a@b.com"));
    assert.notEqual(hashEmail("a@b.com"), hashEmail("c@d.com"));
  });

  it("round-trips encrypt/decrypt", () => {
    const enc = encryptEmail("friend@example.com");
    assert.match(enc, /^v1:/);
    assert.equal(decryptEmail(enc), "friend@example.com");
  });

  it("passes through legacy plaintext", () => {
    assert.equal(decryptEmail("legacy@example.com"), "legacy@example.com");
  });
});

describe("authorizeBearer", () => {
  const prevCron = process.env.CRON_SECRET;
  const prevNode = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL_ENV;

  afterEach(() => {
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
  });

  it("accepts valid bearer in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "super-secret-cron";
    const req = new Request("https://example.com", {
      headers: {
        authorization: "Bearer super-secret-cron",
        "x-forwarded-for": "203.0.113.1",
      },
    });
    assert.equal(await authorizeBearer(req, { secrets: [process.env.CRON_SECRET] }), true);
  });

  it("rejects wrong bearer", async () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "super-secret-cron";
    const req = new Request("https://example.com", {
      headers: { authorization: "Bearer nope", "x-forwarded-for": "203.0.113.2" },
    });
    assert.equal(await authorizeBearer(req, { secrets: [process.env.CRON_SECRET] }), false);
  });

  it("rejects missing secret in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.CRON_SECRET;
    delete process.env.VERCEL_ENV;
    const req = new Request("https://example.com", {
      headers: { authorization: "Bearer anything", "x-forwarded-for": "203.0.113.3" },
    });
    assert.equal(
      await authorizeBearer(req, { secrets: [process.env.CRON_SECRET], allowInsecureDev: true }),
      false
    );
  });

  it("caps brute-force attempts per IP regardless of the secret guessed", async () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "super-secret-cron";
    const ip = `203.0.113.${100 + Math.floor(Math.random() * 50)}`;
    const attempt = () =>
      authorizeBearer(
        new Request("https://example.com", {
          headers: { authorization: "Bearer nope", "x-forwarded-for": ip },
        }),
        { secrets: [process.env.CRON_SECRET] }
      );
    for (let i = 0; i < 20; i++) {
      assert.equal(await attempt(), false); // wrong secret, but still within the attempt budget
    }
    // The budget (BEARER_ATTEMPT_LIMIT in cron-auth.ts) is now spent for this
    // IP — confirm the shared limiter it uses reflects that.
    const { rateLimit } = await import("./rate-limit.ts");
    assert.equal((await rateLimit(`bearer-auth:${ip}`, 20, 10 * 60_000)).ok, false);
  });
});

describe("isSafePushEndpoint (SSRF guard)", () => {
  it("accepts real push services", () => {
    assert.equal(isSafePushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
    assert.equal(isSafePushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  });
  it("rejects non-https", () => {
    assert.equal(isSafePushEndpoint("http://fcm.googleapis.com/fcm/send/abc"), false);
  });
  it("rejects loopback / private / link-local hosts", () => {
    assert.equal(isSafePushEndpoint("https://localhost/x"), false);
    assert.equal(isSafePushEndpoint("https://127.0.0.1/x"), false);
    assert.equal(isSafePushEndpoint("https://10.0.0.5/x"), false);
    assert.equal(isSafePushEndpoint("https://192.168.1.1/x"), false);
    assert.equal(isSafePushEndpoint("https://169.254.169.254/latest/meta-data"), false);
    assert.equal(isSafePushEndpoint("https://172.16.0.1/x"), false);
  });
  it("rejects garbage", () => {
    assert.equal(isSafePushEndpoint("not-a-url"), false);
  });
});

describe("rateLimit", () => {
  it("allows then blocks", async () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    assert.equal((await rateLimit(key, 2, 60_000)).ok, true);
    assert.equal((await rateLimit(key, 2, 60_000)).ok, true);
    assert.equal((await rateLimit(key, 2, 60_000)).ok, false);
  });
});

describe("envStatus", () => {
  const keys = [
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "MONGODB_URL",
    "MONGODB_URI",
    "CRON_SECRET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
  ] as const;
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) snapshot[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of keys) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it("reports missing required keys", () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.MONGODB_URL;
    delete process.env.MONGODB_URI;
    delete process.env.CRON_SECRET;
    const s = envStatus();
    assert.equal(s.ok, false);
    assert.ok(s.missingRequired.includes("AUTH_SECRET"));
    assert.ok(s.missingRequired.includes("MONGODB_URL"));
    assert.ok(s.missingRequired.includes("CRON_SECRET"));
  });

  it("ok when required present", () => {
    process.env.AUTH_SECRET = "x";
    process.env.MONGODB_URL = "mongodb://localhost";
    process.env.CRON_SECRET = "y";
    assert.equal(envStatus().ok, true);
  });
});
