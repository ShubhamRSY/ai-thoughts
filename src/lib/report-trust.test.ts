import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLowTrust, isTrustedReporter, recentRejections, shouldHide } from "./report-trust.ts";

// SECURITY_AUDIT.md M3 thresholds.
const DAY = 864e5;
const now = Date.parse("2026-09-30T12:00:00Z");
const ago = (days: number) => new Date(now - days * DAY);
const facts = (over: Partial<Parameters<typeof isTrustedReporter>[0]> = {}) => ({
  accountAgeMs: 30 * DAY,
  suspended: false,
  isKeeper: false,
  rejectedAt: [] as Date[],
  ...over,
});

describe("who may hide a take alone (M3)", () => {
  it("trusts accounts at least 7 days old with under 2 recent rejections", () => {
    assert.equal(isTrustedReporter(facts({ accountAgeMs: 7 * DAY }), now), true);
    assert.equal(isTrustedReporter(facts({ rejectedAt: [ago(5)] }), now), true);
    assert.equal(isTrustedReporter(facts({ accountAgeMs: 7 * DAY - 1 }), now), false);
    assert.equal(isTrustedReporter(facts({ rejectedAt: [ago(5), ago(40)] }), now), false);
  });

  it("forgets rejections older than 90 days", () => {
    assert.equal(recentRejections([ago(91), ago(100), ago(89)], now), 1);
    assert.equal(isTrustedReporter(facts({ rejectedAt: [ago(91), ago(95)] }), now), true);
  });

  it("always trusts keepers, never suspended accounts", () => {
    assert.equal(isTrustedReporter(facts({ accountAgeMs: 0, isKeeper: true, rejectedAt: [ago(1), ago(2), ago(3)] }), now), true);
    assert.equal(isTrustedReporter(facts({ suspended: true }), now), false);
  });
});

describe("when enough independent reports hide a take (M3)", () => {
  it("a trusted reporter hides it at once", () => {
    assert.equal(shouldHide(true, [0]), true);
  });
  it("one untrusted report does not", () => {
    assert.equal(shouldHide(false, [30 * DAY]), false);
    assert.equal(shouldHide(false, [0]), false);
  });
  it("two reporters at least a day old do", () => {
    assert.equal(shouldHide(false, [DAY, 3 * DAY]), true);
    assert.equal(shouldHide(false, [DAY, DAY - 1]), false);
  });
  it("three reporters of any age do", () => {
    assert.equal(shouldHide(false, [0, 0, 0]), true);
  });
});

describe("low-trust reporters (M3)", () => {
  it("are those with 3+ rejections in 90 days", () => {
    assert.equal(isLowTrust([ago(1), ago(2)], now), false);
    assert.equal(isLowTrust([ago(1), ago(2), ago(3)], now), true);
    assert.equal(isLowTrust([ago(1), ago(2), ago(91)], now), false);
  });
});
