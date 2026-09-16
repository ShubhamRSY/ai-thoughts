import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOurBlobUrl,
  maskEmail,
  redactForStorage,
  scrubPiiForExternal,
} from "./privacy.ts";

describe("privacy helpers", () => {
  it("scrubs email phone and ip before external send", () => {
    const raw = "Reach me at maya@example.com or +1 (555) 123-4567 — host 203.0.113.9";
    const scrubbed = scrubPiiForExternal(raw);
    assert.equal(scrubbed.includes("@"), false);
    assert.match(scrubbed, /\[email\]/);
    assert.match(scrubbed, /\[phone\]/);
    assert.match(scrubbed, /\[ip\]/);
  });

  it("redactForStorage caps length", () => {
    assert.equal(redactForStorage("a".repeat(500), 40).length, 40);
  });

  it("maskEmail hides local part", () => {
    assert.equal(maskEmail("hello@aito.social"), "h***@aito.social");
  });

  it("isOurBlobUrl only allows vercel blob hosts", () => {
    assert.equal(
      isOurBlobUrl("https://abc.public.blob.vercel-storage.com/take.webm"),
      true
    );
    assert.equal(isOurBlobUrl("https://evil.example/x.webm"), false);
  });
});
