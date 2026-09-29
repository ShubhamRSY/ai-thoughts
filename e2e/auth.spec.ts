import { test, expect } from "@playwright/test";

// P0: passwordless email-OTP sign-in is the only way into the product.
// If any step of this breaks, nobody can create an account or sign in.
//
// The browser sends no x-forwarded-for, so without the header below every UI
// sign-in would share the anonymous rate-limit bucket (8/15min). A unique
// synthetic IP per test keeps the bucket from starving mid-suite.
let ipCounter = 10;
async function isolateIp(page: import("@playwright/test").Page): Promise<void> {
  ipCounter = (ipCounter + 1) % 250;
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": `194.4.${test.info().retry}.${ipCounter}`,
  });
}

test("a new visitor can sign in end-to-end with the emailed code", async ({ page }) => {
  await isolateIp(page);
  const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-${uniq}@example.com`;

  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  // The 13+ / Terms agreement gates the button (COPPA age gate).
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
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
  await isolateIp(page);
  const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-${uniq}@example.com`;

  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  // The 13+ / Terms agreement gates the button (COPPA age gate).
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByText("Dev code:")).toBeVisible();

  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/incorrect code/i)).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a returning member signs in with just their email and is never re-asked for a profile", async ({ page }) => {
  test.setTimeout(180_000); // two full sign-ins on an on-demand-compiling dev server
  await isolateIp(page);
  const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-${uniq}@example.com`;
  const signIn = async () => {
    await page.goto("/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(email);
    // The 13+ / Terms agreement gates the button (COPPA age gate).
    await page.getByRole("checkbox", { name: /13 or older/ }).check();
    await page.getByRole("button", { name: "Send sign-in code" }).click();
    const code = (await page.getByText("Dev code:").textContent())?.match(/\d{6}/)?.[0];
    await page.getByLabel("6-digit code").fill(code!);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  };

  await signIn();
  // Save the profile, then leave mid-wizard (before "Start exploring").
  await page.getByLabel("Display name").fill("Return Tester", { timeout: 30_000 });
  await page.getByLabel("Username").fill(`ret${uniq.slice(-14).replace(/-/g, "")}`);
  await page.getByRole("button", { name: "Save & continue" }).click();
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible({ timeout: 30_000 });
  await page.context().clearCookies();

  await signIn();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Save & continue" })).toHaveCount(0);
});
