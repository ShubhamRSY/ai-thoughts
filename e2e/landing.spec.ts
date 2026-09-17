import { test, expect } from "@playwright/test";

// P0: the landing page is the front door for every signed-out visitor.
// If this breaks, nobody can find their way into the product.
test("landing page loads and offers a way to join", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();

  await expect(page.getByRole("heading", { name: "AiTo" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start expressing" })
  ).toHaveAttribute("href", "/sign-in");
});
