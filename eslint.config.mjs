import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Native Capacitor projects — not part of the Next.js/TS source tree.
    "android/**",
    "ios/**",
    // Electron desktop shell (CommonJS) — separate package.
    "desktop/**",
    // Playwright output (generated bundles).
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    rules: {
      // Fetch-on-mount and prop sync patterns are intentional here.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
