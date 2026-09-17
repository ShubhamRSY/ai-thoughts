import { test, expect } from "@playwright/test";

// P2: these pages carry no logic, but a broken build/routing regression or a
// bad redirect would 404 them silently — they're required reading (privacy,
// terms) and the only install instructions native-app users get.
const PAGES: Array<{ path: string; heading: string | RegExp }> = [
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/terms", heading: "Terms of Use" },
  { path: "/guidelines", heading: "Community Guidelines" },
  { path: "/install", heading: /^Install/ },
];

for (const { path, heading } of PAGES) {
  test(`${path} renders its heading`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  });
}
