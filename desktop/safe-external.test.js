const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { isSafeExternalUrl, openExternalSafely, isSiteOrigin } = require("./safe-external.js");

describe("external links (H4)", () => {
  it("allows only https, http and mailto", () => {
    for (const ok of ["https://aito.social/x", "http://example.com", "mailto:keepers@aito.social"]) {
      assert.equal(isSafeExternalUrl(ok), true, ok);
    }
    for (const bad of [
      "ms-msdt:/id PCWDiagnostic",
      "search-ms:query=x&crumb=location:\\\\evil\\share",
      "file:///C:/Windows/System32/calc.exe",
      "smb://evil/share",
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "vbscript:msgbox(1)",
      "zoommtg://x",
      "not a url",
      "",
    ]) {
      assert.equal(isSafeExternalUrl(bad), false, bad);
    }
  });

  it("never calls the OS for a blocked scheme", () => {
    const opened = [];
    const shell = { openExternal: (u) => opened.push(u) };
    assert.equal(openExternalSafely(shell, "ms-msdt:/id x"), false);
    assert.equal(openExternalSafely(shell, "https://aito.social/"), true);
    assert.deepEqual(opened, ["https://aito.social/"]);
  });
});

describe("site origin (H4)", () => {
  const site = "https://aito.social";
  it("matches only the exact origin", () => {
    assert.equal(isSiteOrigin("https://aito.social/app?x=1", site), true);
    for (const other of [
      "http://aito.social/app",
      "https://aito.social.evil.com/",
      "https://evil.com/?https://aito.social",
      "https://challenges.cloudflare.com/turnstile",
      "https://aito.social:8443/",
      "garbage",
    ]) {
      assert.equal(isSiteOrigin(other, site), false, other);
    }
  });
});
