import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { flaggedBody, isFlaggedContent } from "./content-moderation.ts";

// SECURITY_AUDIT.md M2: the E2E suite points screening at a local fake via
// OPENAI_BASE_URL. Production must ignore that, so env can never redirect
// screening (and the API key) somewhere else.

const saved = { ...process.env };
const realFetch = globalThis.fetch;
afterEach(() => {
  process.env = { ...saved };
  globalThis.fetch = realFetch;
});

async function urlUsed(env: Record<string, string>): Promise<string> {
  Object.assign(process.env, { OPENAI_API_KEY: "k", ...env });
  let seen = "";
  globalThis.fetch = (async (url: string | URL) => {
    seen = String(url);
    return new Response(JSON.stringify({ results: [{ flagged: false }] }), { status: 200 });
  }) as typeof fetch;
  await isFlaggedContent({ text: "hello" });
  return seen;
}

describe("moderation endpoint (M2)", () => {
  it("uses the override outside production", async () => {
    assert.equal(
      await urlUsed({ NODE_ENV: "development", OPENAI_BASE_URL: "http://127.0.0.1:3999/" }),
      "http://127.0.0.1:3999/v1/moderations"
    );
  });

  it("ignores the override in production", async () => {
    assert.equal(
      await urlUsed({ NODE_ENV: "production", OPENAI_BASE_URL: "http://127.0.0.1:3999" }),
      "https://api.openai.com/v1/moderations"
    );
  });

  it("gives takes, edits and replies one flagged response shape", () => {
    for (const what of ["take", "edit", "reply"] as const) assert.equal(flaggedBody(what).code, "flagged");
  });
});
