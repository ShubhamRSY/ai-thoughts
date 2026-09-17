import { test, expect } from "@playwright/test";

// P0: passwordless email-OTP sign-in is the only way into the product.
// If any step of this breaks, nobody can create an account or sign in.
test("a new visitor can sign in end-to-end with the emailed code", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();

  // Dev-mode-only: the API returns the OTP in-band (no RESEND_API_KEY set),
  // and the UI surfaces it so the flow is testable without real email.
  const devCodeText = page.getByText("Dev code:");
  await expect(devCodeText).toBeVisible();
  const code = (await devCodeText.textContent())?.match(/\d{6}/)?.[0];
  expect(code, "dev OTP code should be a 6-digit string").toMatch(/^\d{6}$/);

  await page.getByLabel("6-digit code").fill(code!);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/app$/);

  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === "aithoughts.session")).toBe(true);

  // A refresh should stay signed in (session persisted server-side, not just in memory).
  await page.reload();
  await expect(page).toHaveURL(/\/app$/);
});

test("an unrecognized code is rejected with an error, not a silent sign-in", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByText("Dev code:")).toBeVisible();

  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/incorrect code/i)).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});
