// `npm test`: run every src/**/*.test.ts. node --test exits 0 when a glob
// matches nothing, so a mistyped pattern would "pass" with zero tests — this
// refuses to.
import { globSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = globSync("src/**/*.test.ts");
if (files.length === 0) {
  console.error("No test files matched src/**/*.test.ts — refusing to report success.");
  process.exit(1);
}
const { status } = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { stdio: "inherit" });
process.exit(status ?? 1);
