import assert from "node:assert/strict";
import { test } from "node:test";
import { safeRedirectPath } from "./safe-redirect.ts";

test("keeps in-site paths", () => {
  assert.equal(safeRedirectPath("/app?post=1#c"), "/app?post=1#c");
  assert.equal(safeRedirectPath("/keeper"), "/keeper");
});

test("refuses anything that leaves the site", () => {
  for (const evil of ["//evil.com", "/\\evil.com", "/\\/evil.com", "/%5Cevil.com/../..", "https://evil.com", "javascript:alert(1)", "evil.com", "", null]) {
    const out = safeRedirectPath(evil as string);
    assert.ok(out.startsWith("/") && !new URL(out, "http://x").host.includes("evil"), `${evil} → ${out}`);
  }
  assert.equal(safeRedirectPath("/\\evil.com"), "/app");
});
