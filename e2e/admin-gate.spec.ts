import { test, expect } from "@playwright/test";

// P1 (security-relevant): a signed-out visitor must never see admin controls
// or admin data. `src/proxy.ts` (Next's edge middleware) redirects
// unauthenticated requests to /admin and /keeper to /sign-in before
// any page code runs — stronger than a client-side check, since no admin
// markup is ever sent to the browser. Regressions here leak moderation
// tooling / metrics to the public internet.
test("signed-out visitor is redirected off /admin before any admin markup loads", async ({
  page,
}) => {
  const response = await page.goto("/admin");

  // Playwright follows the redirect; assert we landed on sign-in, not admin.
  await expect(page).toHaveURL(/\/sign-in\?from=%2Fadmin$/);
  expect(response?.request().redirectedFrom()).not.toBeNull();

  await expect(page.getByRole("heading", { name: "Join Voices" })).toBeVisible();

  // None of the authenticated-admin-only content should ever be reachable.
  await expect(page.getByText("Global control")).not.toBeVisible();
  await expect(page.getByText("No admin access")).not.toBeVisible();
});
