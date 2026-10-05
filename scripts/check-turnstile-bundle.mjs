// Runs after `next build`. When the server enforces Turnstile, the client
// bundle must contain the site key, or the widget never renders and every
// sign-in fails with captcha_failed. Checks the built output, not the env.
import { globSync, readFileSync } from "node:fs";

const secret = process.env.TURNSTILE_SECRET_KEY;
const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
if (!secret) process.exit(0);

const chunks = globSync(".next/static/**/*.js");
if (!key || !chunks.some((f) => readFileSync(f, "utf8").includes(key))) {
  console.error(
    `TURNSTILE_SECRET_KEY is set but the site key is ${key ? "not in" : "missing from"} the client bundle ` +
      `(${chunks.length} chunks checked). Sign-in would reject everyone. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY and rebuild.`
  );
  process.exit(1);
}
console.log("Turnstile site key found in client bundle.");
