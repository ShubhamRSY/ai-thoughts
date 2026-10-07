import { test, expect } from "@playwright/test";

// P0: the landing page is the front door for every signed-out visitor.
// If this breaks, nobody can find their way into the product.
test("landing page loads and lets anyone in without an account", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();

  await expect(page.getByRole("heading", { name: "AiTo" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Voices" })
  ).toHaveAttribute("href", "/app");
});

// The "What you do here" demo is decorative; the steps must stay real text that
// every visitor (and search engine) gets, with or without motion.
for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`landing explains the three steps (reduced motion: ${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");

    const steps = page.locator(".landing-demo .landing-step-title");
    await expect(steps).toHaveText(["Pick a feeling", "Say it your way", "Find your people"]);
    await expect(page.locator(".demo-stage")).toHaveAttribute("aria-hidden", "true");
  });
}
