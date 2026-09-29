import { test, expect, type Page } from "@playwright/test";

const tapRow = (page: Page) => page.getByRole("group", { name: "Pick a feeling" });

// The retention loop: the daily tap asks for sign-in when tapped, and a
// signed-in tap sticks. Guests are sent to sign-in before the feed loads.
// Also the public trust page.
// GitHub runners are slow and `next dev` compiles on demand: give every wait real headroom.
const SLOW = { timeout: 30_000 };
let ip = 60;
async function signIn(page: Page) {
  ip = (ip + 1) % 250;
  await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": `194.5.0.${ip}` });
  const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(`e2e-mood-${uniq}@example.com`);
  // The 13+ / Terms agreement gates the button (COPPA age gate).
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  const code = (await page.getByText("Dev code:").textContent())?.match(/\d{6}/)?.[0];
  await page.getByLabel("6-digit code").fill(code!);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/app$/);
  // First-run wizard covers the page for brand-new accounts: profile, pick, Next, Skip, Start.
  await page.getByLabel("Display name").fill("Mood Tester", { timeout: 30_000 });
  await page.getByLabel("Username").fill(`moodt${uniq.slice(-14)}`);
  await page.getByRole("button", { name: "Save & continue" }).click();
  await page.getByRole("button", { name: /I use it every day/ }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Start exploring" }).click();
}

test("a guest is sent to sign-in before the feed loads", async ({ page }) => {
  test.setTimeout(120_000);
  const response = await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in\?from=%2Fapp$/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Send sign-in code" })).toBeVisible(SLOW);
  expect(response?.request().redirectedFrom()).not.toBeNull();
});

test("a signed-in tap is saved and survives a reload", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const worried = tapRow(page).getByRole("button", { name: "Worried" });
  await worried.click();
  await expect(worried).toHaveAttribute("aria-pressed", "true", SLOW);
  await page.reload();
  await expect(tapRow(page).getByRole("button", { name: "Worried" })).toHaveAttribute("aria-pressed", "true", SLOW);
  await expect(page.getByLabel("Your last 7 days")).toBeVisible(SLOW);
});

test("mood API requires sign-in", async ({ request }) => {
  const res = await request.post("/api/mood", { data: { feeling: "worried", day: "2026-01-01" } });
  expect(res.status()).toBe(401);
});

test("trust page shows numbers, support page is hidden without a payment link", async ({ page }) => {
  await page.goto("/trust");
  await expect(page.getByText("Reports received")).toBeVisible(SLOW);
  const res = await page.goto("/support");
  expect(res?.status()).toBe(404);
});
