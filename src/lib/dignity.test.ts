import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkDignity, deobfuscate } from "./dignity.ts";

describe("dignity filter: direct terms", () => {
  it("blocks explicit sexual content", () => {
    assert.equal(checkDignity("send nudes plz").ok, false);
    assert.equal(checkDignity("hot naked pics").ok, false);
    assert.equal(checkDignity("here is a sex tape of my ex").ok, false);
  });
  it("blocks slurs and harassment", () => {
    assert.equal(checkDignity("you are a retard").ok, false);
    assert.equal(checkDignity("go die, bot").ok, false);
    assert.equal(checkDignity("kill yourself").ok, false);
  });
  it("allows sharp AI critique", () => {
    assert.equal(
      checkDignity("AI is making bias in hiring worse and nobody checks it").ok,
      true
    );
  });
  it("still blocks hard terms inside a consent context", () => {
    assert.equal(
      checkDignity("consent is why porn in AI training is a problem").ok,
      false
    );
  });
  it("allows the consent context itself", () => {
    assert.equal(checkDignity("consent matters in how AI moderates").ok, true);
  });
  it("handles empty input", () => {
    assert.equal(checkDignity("").ok, true);
    assert.equal(checkDignity("   ").ok, true);
  });
});

describe("dignity filter: obfuscation", () => {
  it("blocks leetspeak digits", () => {
    assert.equal(checkDignity("k1ll y0urs3lf bot").ok, false);
    assert.equal(checkDignity("ki11 yourself").ok, false);
    assert.equal(checkDignity("n0 nud3s plz").ok, false);
    assert.equal(checkDignity("s3x t4pe leaked").ok, false);
    assert.equal(checkDignity("p0rn link here").ok, false);
    assert.equal(checkDignity("b00bs pics").ok, false);
  });
  it("blocks space-separated obfuscation via compacting", () => {
    assert.equal(checkDignity("p o r n").ok, false);
    assert.equal(checkDignity("po rn").ok, false);
    assert.equal(checkDignity("n a k e d pics").ok, false);
  });
  it("deobfuscate maps both readings of digit-one", () => {
    assert.equal(deobfuscate("k1ll y0urs3lf"), "kill yourself");
    assert.equal(deobfuscate("ki11 me"), "kiii me");
    assert.equal(deobfuscate("ki11 me", { oneAs: "l" }), "kill me");
  });
});