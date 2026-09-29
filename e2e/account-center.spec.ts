import { test, expect, request as pwRequest } from "@playwright/test";

// UI coverage for the Account Center: choose a privacy level, see it persist,
// and approve a follow request. Sign-in goes through the API on the page's own
// cookie jar (the OTP UI flow is covered in auth.spec.ts) and uses a distinct
// X-Forwarded-For so it doesn't eat the shared per-IP sign-in budget.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
// A synthetic client IP per test. The retry gets its own (third octet), since
// one /app + Account Center run makes ~150 API calls and a retry sharing the
// first attempt's bucket hit the proxy's 300 / 5 min backstop — the page then
// renders 429s as disabled controls and the test fails for the wrong reason.
const ip = (n: number) => `10.78.${test.info().retry}.${n}`;

type Api = { post: (url: string, o: object) => Promise<import("@playwright/test").APIResponse> };

async function signInAs(api: Api, email: string, ip: string) {
  const headers = { "X-Forwarded-For": ip };
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email }, headers })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true }, headers });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return (await verify.json()).user.handle as string;
}

async function signIn(api: Api, label: string, ip: string) {
  return signInAs(api, `e2e-ui-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`, ip);
}

// The proxy caps requests per client IP (300 / 5 min), and every /app load plus
// Account Center visit makes many API calls. Give each browser test its own
// forwarded address, like a distinct client, so these specs don't spend the
// budget the rest of the suite shares. (Same IP as the test's API sign-in.)
async function asClient(page: import("@playwright/test").Page, ip: string) {
  await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": ip });
}

// New accounts get a full-screen onboarding wizard over /app (prefs.onboarded
// === false) that intercepts every click. Mark it done the way the app does.
async function skipOnboarding(page: import("@playwright/test").Page) {
  const res = await page.request.post("/api/prefs", {
    data: { onboarded: true },
    headers: { Origin: ORIGIN },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test("account center: pick private, it persists, and follow requests can be approved", async ({
  page,
}) => {
  await asClient(page, ip(1));
  const ownerHandle = await signIn(page.request, "owner", ip(1));
  await skipOnboarding(page);

  await page.goto("/app");
  await page.getByRole("button", { name: "You", exact: true }).first().click();
  await page.getByRole("button", { name: /Account Center/ }).click();

  const publicOpt = page.getByRole("radio", { name: /Public/ });
  const privateOpt = page.getByRole("radio", { name: /Private/ });
  await expect(publicOpt).toHaveAttribute("aria-checked", "true");

  await privateOpt.click();
  await expect(privateOpt).toHaveAttribute("aria-checked", "true");

  // Persisted server-side, not just in component state.
  await page.reload();
  await page.getByRole("button", { name: "You", exact: true }).first().click();
  await page.getByRole("button", { name: /Account Center/ }).click();
  await expect(page.getByRole("radio", { name: /Private/ })).toHaveAttribute(
    "aria-checked",
    "true"
  );

  // Someone else asks to follow; the owner sees the request and approves it.
  const other = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip(2) },
  });
  try {
    const otherHandle = await signIn(other, "other", ip(2));
    const asked = await other.post("/api/follows", { data: { handle: ownerHandle, action: "follow" } });
    expect(await asked.json()).toMatchObject({ requested: true });

    await page.reload();
    await page.getByRole("button", { name: "You", exact: true }).first().click();
    await page.getByRole("button", { name: /Account Center/ }).click();
    await expect(page.getByText(/Follow requests \(1\)/)).toBeVisible();

    // The row is removed optimistically, so wait for the real request to land.
    const [approve] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/api/follows") && r.request().method() === "POST"
      ),
      page.getByRole("button", { name: new RegExp(`Approve ${otherHandle}`, "i") }).click(),
    ]);
    expect(approve.ok()).toBeTruthy();
    await expect(page.getByText(/Follow requests/)).toHaveCount(0);

    const state = await (
      await other.get(`/api/follows?handle=${encodeURIComponent(ownerHandle)}`)
    ).json();
    expect(norm(state.followState)).toBe("following");
  } finally {
    await other.dispose();
  }
});

async function openAccountCenter(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "You", exact: true }).first().click();
  await page.getByRole("button", { name: /Account Center/ }).click();
}

async function openPersonFromSearch(page: import("@playwright/test").Page, handle: string) {
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  await page.getByPlaceholder("Search people").fill(norm(handle));
  await page.getByRole("button", { name: new RegExp(norm(handle), "i") }).first().click();
}

test("account center: block from a profile, then unblock from Blocked accounts", async ({ page }) => {
  await asClient(page, ip(3));
  await signIn(page.request, "blocker", ip(3));
  await skipOnboarding(page);
  const other = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip(4) },
  });
  try {
    const otherHandle = await signIn(other, "blocked", ip(4));

    await page.goto("/app");
    await openPersonFromSearch(page, otherHandle);

    page.once("dialog", (d) => void d.accept());
    const [blockRes] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/blocks") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Block", exact: true }).click(),
    ]);
    expect(blockRes.ok()).toBeTruthy();

    await openAccountCenter(page);
    await expect(page.getByText(/Blocked accounts \(1\)/)).toBeVisible();

    const [unblockRes] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/blocks") && r.request().method() === "POST"),
      page.getByRole("button", { name: new RegExp(`Unblock ${otherHandle}`, "i") }).click(),
    ]);
    expect(unblockRes.ok()).toBeTruthy();
    await expect(page.getByText(/Blocked accounts/)).toHaveCount(0);

    const list = await (await page.request.get("/api/blocks")).json();
    expect(list.blocked).toEqual([]);
  } finally {
    await other.dispose();
  }
});

test("search shows Requested for a private account, not Following", async ({ page }) => {
  await asClient(page, ip(5));
  await signIn(page.request, "asker", ip(5));
  await skipOnboarding(page);
  const owner = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip(6) },
  });
  try {
    const ownerHandle = await signIn(owner, "private-owner", ip(6));
    expect((await owner.put("/api/account/privacy", { data: { privacy: "private" } })).ok()).toBeTruthy();

    await page.goto("/app");
    await page.getByRole("button", { name: "Search", exact: true }).first().click();
    await page.getByPlaceholder("Search people").fill(norm(ownerHandle));
    const row = page.getByRole("listitem").filter({ hasText: norm(ownerHandle) });
    const [followRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/api/follows") && r.request().method() === "POST"
      ),
      row.getByRole("button", { name: "Follow", exact: true }).click(),
    ]);
    expect(followRes.ok()).toBeTruthy();
    await expect(row.getByRole("button", { name: "Requested" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Following" })).toHaveCount(0);
  } finally {
    await owner.dispose();
  }
});

test("account center: email digests toggle independently, help links exist, view replaces habits", async ({
  page,
}) => {
  await asClient(page, ip(7));
  await signIn(page.request, "notif", ip(7));
  await skipOnboarding(page);
  await page.goto("/app");
  await page.getByRole("button", { name: "You", exact: true }).first().click();

  // The old toggles in DailyHabits now point at the Account Center.
  await expect(page.getByText("Invite someone")).toBeVisible();
  await page.getByRole("button", { name: "Notification settings" }).click();

  // The Account Center replaces the whole You view (no habits underneath it).
  await expect(page.getByRole("heading", { name: "Account Center" })).toBeVisible();
  await expect(page.getByText("Invite someone")).toHaveCount(0);

  const activity = page.getByRole("button", { name: "Activity email" });
  const weekly = page.getByRole("button", { name: "Weekly Voices" });
  await expect(activity).toHaveAttribute("aria-pressed", "false");
  await expect(weekly).toHaveAttribute("aria-pressed", "false"); // nothing opted in by default

  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/prefs") && r.request().method() === "POST"),
    activity.click(),
  ]);
  // Only the changed field is sent, and the other digest stays off.
  expect(res.request().postDataJSON()).toEqual({ email_digest: true });
  expect(await res.json()).toMatchObject({ email_digest: true, weekly_digest: false });

  await page.reload();
  await openAccountCenter(page);
  await expect(page.getByRole("button", { name: "Activity email" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Weekly Voices" })).toHaveAttribute("aria-pressed", "false");

  for (const [name, href] of [
    ["Community guidelines", "/guidelines"],
    ["Privacy policy", "/privacy"],
    ["Terms of service", "/terms"],
    ["Report a problem or contact us", "/contact"],
  ]) {
    await expect(page.getByRole("link", { name })).toHaveAttribute("href", href);
  }

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Invite someone")).toBeVisible();
});

test("account center: device permissions reflect the browser's real state", async ({ page, context }) => {
  await asClient(page, ip(8));
  await signIn(page.request, "perms", ip(8));
  await skipOnboarding(page);
  // Chromium reports camera as "prompt" by default; stub it as blocked so the
  // denied path is covered too. Everything else is left to the real browser.
  await page.addInitScript(() => {
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (d) =>
      (d as { name: string }).name === "camera"
        ? Promise.resolve({ state: "denied" } as PermissionStatus)
        : query(d);
  });
  await page.goto("/app");
  await openAccountCenter(page);

  const row = (label: string) => page.getByRole("listitem").filter({ hasText: label });
  await expect(row("Notifications")).toContainText("Not asked yet");
  await expect(row("Microphone")).toContainText("Not asked yet");
  await expect(row("Microphone").getByRole("button", { name: /Allow microphone/ })).toBeVisible();
  await expect(row("Camera")).toContainText("Blocked");
  await expect(row("Camera")).toContainText("re-enable it in your browser");

  // Granted elsewhere (browser settings), then the app is opened again.
  await context.grantPermissions(["notifications", "microphone"]);
  await page.reload();
  await openAccountCenter(page);
  await expect(row("Notifications")).toContainText("Allowed");
  await expect(row("Microphone")).toContainText("Allowed");
  await expect(row("Camera")).toContainText("Blocked"); // still the stub
});

test("account center: see your devices, sign one out, then sign out everywhere", async ({ page }) => {
  const email = `e2e-ui-sessions-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await asClient(page, ip(9));
  await signInAs(page.request, email, ip(9));
  await skipOnboarding(page);

  // The same account on a second "device".
  const other = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: {
      Origin: ORIGIN,
      "X-Forwarded-For": ip(10),
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
    },
  });
  try {
    await signInAs(other, email, ip(10));

    await page.goto("/app");
    await openAccountCenter(page);
    await expect(page.getByText("This device")).toBeVisible();
    await expect(page.getByText("Firefox on Linux")).toBeVisible();

    const [revoked] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/api/account/sessions") && r.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Sign out Firefox on Linux" }).click(),
    ]);
    expect(revoked.ok()).toBeTruthy();
    await expect(page.getByText("Firefox on Linux")).toHaveCount(0);
    expect((await other.get("/api/prefs")).status()).toBe(401);
    expect((await page.request.get("/api/prefs")).status()).toBe(200);

    // Sign out everywhere ends this device too and lands on the public page.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.get("/api/prefs")).status()).toBe(401);
  } finally {
    await other.dispose();
  }
});

test("account center: archive a take from your profile, see it in Archive and Your activity, restore it", async ({
  page,
}) => {
  await asClient(page, ip(11));
  await signIn(page.request, "archive", ip(11));
  await skipOnboarding(page);
  const content = `e2e archive ui ${Date.now()}`;
  const made = await page.request.post("/api/posts", {
    data: { content, media_type: "text" },
    headers: { Origin: ORIGIN },
  });
  expect(made.ok(), await made.text()).toBeTruthy();

  await page.goto("/app");
  await page.getByRole("button", { name: "You", exact: true }).first().click();
  await expect(page.getByText(content).first()).toBeVisible();

  const [archived] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/archive") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Archive take" }).first().click(),
  ]);
  expect(archived.ok()).toBeTruthy();
  await expect(page.getByText(content)).toHaveCount(0); // gone from your own profile

  await openAccountCenter(page);
  // Both the archive list and the activity log show it (activity marks it archived).
  await expect(page.getByRole("button", { name: /Restore take/ })).toBeVisible();
  await expect(page.getByText("You shared a take (archived)")).toBeVisible();

  await page.getByRole("tab", { name: "Replies" }).click();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
  await page.getByRole("tab", { name: "All" }).click();

  const [restored] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/archive") && r.request().method() === "POST"),
    page.getByRole("button", { name: /Restore take/ }).click(),
  ]);
  expect(restored.ok()).toBeTruthy();
  await expect(page.getByText(/Nothing archived/)).toBeVisible();
  await expect(page.getByText("You shared a take")).toBeVisible();
});
