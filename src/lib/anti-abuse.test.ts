import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkHandleAllowed,
  checkDisplayNameAllowed,
  checkDisposableEmail,
  checkContentQuality,
  jaccardSimilarity,
  scoreAiSlop,
  postLimitsForAge,
} from "./anti-abuse.ts";

describe("anti-abuse handles", () => {
  it("blocks reserved handles", () => {
    assert.equal(checkHandleAllowed("@admin").ok, false);
    assert.equal(checkHandleAllowed("@aithoughts").ok, false);
    assert.equal(checkHandleAllowed("@AIThoughts99").ok, false);
  });
  it("allows normal handles", () => {
    assert.equal(checkHandleAllowed("@yedekarshubh3080").ok, true);
    assert.equal(checkHandleAllowed("@maya_feels").ok, true);
  });
  it("blocks official-looking display names", () => {
    assert.equal(checkDisplayNameAllowed("AI Thoughts Official").ok, false);
  });
});

describe("anti-abuse email", () => {
  it("blocks disposable domains", () => {
    assert.equal(checkDisposableEmail("x@mailinator.com").ok, false);
  });
  it("allows normal email", () => {
    assert.equal(checkDisposableEmail("friend@gmail.com").ok, true);
  });
});

describe("anti-abuse content", () => {
  it("flags generic AI essay phrasing for new accounts", () => {
    const essay =
      "In today's rapidly evolving digital landscape, it's important to note that AI will delve into multifaceted challenges. " +
      "This is a testament to how we navigate the complexities of modern systems with robust frameworks that play a crucial role. " +
      "In conclusion, leverage cutting-edge synergies across every dimension of progress and unpack the nuances carefully.";
    const scored = scoreAiSlop(essay);
    assert.ok(scored.score >= 3);
    const check = checkContentQuality(essay, { newAccount: true });
    assert.equal(check.ok, false);
  });

  it("allows short personal feelings", () => {
    const check = checkContentQuality(
      "I love how AI helps me draft emails but I worry about my job.",
      { newAccount: true }
    );
    assert.equal(check.ok, true);
  });

  it("detects near-duplicates", () => {
    const a = "I worry about deepfakes ruining trust in video forever";
    const b = "I worry about deepfakes ruining trust in video forever!";
    assert.ok(jaccardSimilarity(a, b) > 0.9);
  });
});

describe("anti-abuse limits", () => {
  it("tightens caps for brand-new accounts", () => {
    const young = postLimitsForAge(10 * 60_000);
    assert.equal(young.maxPerDay, 1);
    const week = postLimitsForAge(2 * 24 * 3600_000);
    assert.equal(week.maxPerDay, 8);
  });
});
