import { test, expect } from "@playwright/test";

// A sign-in alert on every visit trains people to ignore the one email that
// matters. The owner should hear about a device they haven't used before, and
// nothing about the one they use daily.
//
// Device identity is the stable label ("Chrome on macOS"), not the raw
// User-Agent, so a browser version bump doesn't look like a new machine.
let ipCounter = 60;
async function isolateIp(page: import("@playwright/test").Page): Promise<void> {
  ipCounter = (ipCounter + 1) % 250;
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": `194.8.${test.info().retry}.${ipCounter}`,
  });
}

/** Signs in and returns; the dev OTP is surfaced in the UI when Resend is unset. */
async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("checkbox", { name: /18 or older/ }).check();
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByText("Dev code:")).toBeVisible({ timeout: 30_000 });
  const code = (await page.getByText("Dev code:").textContent())?.match(/\d{6}/)?.[0];
  await page.getByLabel("6-digit code").fill(code!);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

/** Completes the whole first-run wizard so the tab bar is reachable. */
async function finishProfile(page: import("@playwright/test").Page, name: string, handle: string) {
  await page.getByLabel("Display name").fill(name, { timeout: 30_000 });
  await page.getByLabel("Username").fill(handle);
  await page.getByRole("button", { name: "Save & continue" }).click();
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible({ timeout: 30_000 });
  // "Next" only advances one step; the wizard ends on "Start exploring", and the
  // Updates tab sits underneath it until then.
  const done = page.getByRole("button", { name: "Start exploring" });
  if (await done.count()) await done.click();
  await expect(page.getByRole("button", { name: /^\s*activity\s*$/i }).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** The Updates list is where a new-device notice lands (push has no browser here). */
async function updatesText(page: import("@playwright/test").Page): Promise<string> {
  const tab = page.getByRole("button", { name: /^\s*activity\s*$/i }).first();
  await expect(tab, "the Updates tab should be reachable").toBeVisible({ timeout: 30_000 });
  // The feed re-fetches on a timer and nudges the nav, so the tab never settles
  // long enough for the stability check. Visibility above is the real guard.
  await tab.click({ force: true });
  await page.waitForTimeout(800);
  return (await page.locator("body").innerText()).toLowerCase();
}

type Browser = import("@playwright/test").Browser;

/**
 * A fresh context with a chosen User-Agent — i.e. a simulated device. The
 * User-Agent string is the only device signal the app has, so both contexts are
 * built explicitly rather than relying on the `page` fixture's UA.
 */
async function device(browser: Browser, userAgent: string) {
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();
  await isolateIp(page);
  return { context, page };
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile Safari/604.1";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe("new-device notice", () => {
  test("fires for a device the account has not used before", async ({ browser }) => {
    test.setTimeout(300_000);
    const id = unique();
    const email = `e2e-device-${id}@example.com`;

    // First device creates the account, so there is nothing to warn about yet.
    const laptop = await device(browser, MAC_UA);
    await signIn(laptop.page, email);
    await finishProfile(laptop.page, "Device Tester", `dev${id.slice(-12).replace(/-/g, "")}`);

    // Same account, genuinely different device: fresh jar, phone UA.
    const phone = await device(browser, IPHONE_UA);
    await signIn(phone.page, email);
    await phone.page.waitForTimeout(3000); // the notice is written in `after()`

    const text = await updatesText(phone.page);
    expect(text, "Updates should mention the new device").toContain("new sign-in");
    // And it names the device, so a phone is distinguishable from a laptop.
    expect(text).toContain("ios");

    await laptop.context.close();
    await phone.context.close();
  });

  test("stays quiet when the same device signs in again with cookies cleared", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const id = unique();
    const email = `e2e-samedevice-${id}@example.com`;

    const first = await device(browser, MAC_UA);
    await signIn(first.page, email);
    await finishProfile(first.page, "Same Device", `same${id.slice(-12).replace(/-/g, "")}`);
    await first.context.close();

    // Same UA (so the same device), brand-new cookie jar: a new session id, but
    // not a new device. Clearing cookies is the everyday case — it must stay
    // silent, or the alert becomes noise.
    const second = await device(browser, MAC_UA);
    await signIn(second.page, email);
    await second.page.waitForTimeout(3000);

    const text = await updatesText(second.page);
    expect(text, "a repeat sign-in on a known device should not warn").not.toContain("new sign-in");

    await second.context.close();
  });

  test("stays quiet for a brand-new account's very first sign-in", async ({ browser }) => {
    test.setTimeout(300_000);
    const id = unique();
    const first = await device(browser, IPHONE_UA);
    await signIn(first.page, `e2e-firsttime-${id}@example.com`);
    await finishProfile(first.page, "First Time", `first${id.slice(-12).replace(/-/g, "")}`);
    await first.page.waitForTimeout(2500);

    // Signing up is not a suspicious sign-in; nobody needs telling off for it.
    expect(await updatesText(first.page)).not.toContain("new sign-in");
    await first.context.close();
  });
});

test("the email revoke link refuses a missing or forged token", async ({ request }) => {
  const missing = await request.get("/api/account/sessions/revoke?token=not-a-token");
  expect(missing.status()).toBe(400);
  expect(await missing.text()).toContain("expired");

  // Correctly signed payload, wrong signature.
  const forged =
    "eyJ1IjoiMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJzIjoiMSIsImV4cCI6NDEwMjQ0NDgwMH0.forged";
  expect((await request.get(`/api/account/sessions/revoke?token=${forged}`)).status()).toBe(400);

  // Tampered payload (userId swapped), original signature.
  const tampered =
    "eyJ1IjoiNjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsInMiOiIxIiwiZXhwIjo0MTAyNDQ0ODAwfQ." +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  expect((await request.get(`/api/account/sessions/revoke?token=${tampered}`)).status()).toBe(400);
});