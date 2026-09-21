import { test, expect, type Page } from "@playwright/test";

const tapRow = (page: Page) => page.getByRole("group", { name: "Pick a feeling" });

// The retention loop: anyone can browse, the daily tap asks for sign-in only
// when tapped, and a signed-in tap sticks. Also the public trust page.
let ip = 60;
async function signIn(page: Page) {
  ip = (ip + 1) % 250;
  await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": `194.5.0.${ip}` });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(`e2e-mood-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  const code = (await page.getByText("Dev code:").textContent())?.match(/\d{6}/)?.[0];
  await page.getByLabel("6-digit code").fill(code!);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/app$/);
  // First-run wizard covers the page for brand-new accounts: pick, Next, Skip, Start.
  await page.getByRole("button", { name: /I use it every day/ }).click({ timeout: 10000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Start exploring" }).click();
}

test("a guest sees the daily tap and is only sent to sign-in when they use it", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText("How does AI feel today?")).toBeVisible();
  await page.waitForLoadState("networkidle"); // let React hydrate the handler
  await tapRow(page).getByRole("button", { name: "Worried" }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=(%2F|\/)app$/, { timeout: 20000 });
});

test("a signed-in tap is saved and survives a reload", async ({ page }) => {
  await signIn(page);
  const worried = tapRow(page).getByRole("button", { name: "Worried" });
  await worried.click();
  await expect(worried).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(tapRow(page).getByRole("button", { name: "Worried" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Your last 7 days")).toBeVisible();
});

test("mood API requires sign-in", async ({ request }) => {
  const res = await request.post("/api/mood", { data: { feeling: "worried", day: "2026-01-01" } });
  expect(res.status()).toBe(401);
});

test("trust page shows numbers, support page is hidden without a payment link", async ({ page }) => {
  await page.goto("/trust");
  await expect(page.getByText("Reports received")).toBeVisible();
  const res = await page.goto("/support");
  expect(res?.status()).toBe(404);
});
