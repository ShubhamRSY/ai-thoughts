import { test, expect, request as pwRequest } from "@playwright/test";

// The Instagram-style flow in the browser: find someone, tap Message, send,
// see their reply arrive in the open thread, and the header badge for unread chats.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const ip = (n: number) => `10.84.${test.info().retry}.${n}`;

type Api = { post: (url: string, o: object) => Promise<import("@playwright/test").APIResponse> };

async function signIn(api: Api, label: string, addr: string) {
  const email = `e2e-dmui-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const headers = { "X-Forwarded-For": addr };
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email }, headers })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true }, headers });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  await api.post("/api/prefs", { data: { onboarded: true }, headers: { ...headers, Origin: ORIGIN } });
  return (await verify.json()).user.handle as string;
}

test("message someone from their profile, get a reply, see the unread badge", async ({ page }, info) => {
  await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": ip(1) });
  await signIn(page.request, "a", ip(1));
  const other = await pwRequest.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip(2) } });
  try {
    const bHandle = await signIn(other, "b", ip(2));

    await page.goto("/app");
    await page.getByRole("button", { name: "Search", exact: true }).first().click();
    await page.getByPlaceholder("Search people").fill(norm(bHandle));
    await page.getByRole("listitem").filter({ hasText: norm(bHandle) }).getByText(norm(bHandle)).first().click();

    await page.getByRole("button", { name: "Message", exact: true }).click();
    await page.getByRole("textbox", { name: "Message" }).fill("your take stayed with me all day");
    await page.getByRole("button", { name: "Send" }).click();
    // Sent = the composer clears and the text shows as a bubble (not just the draft).
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("", { timeout: 15_000 });
    await expect(page.getByText("your take stayed with me all day")).toBeVisible();

    // B replies from elsewhere; the open thread picks it up by polling.
    const { items } = await (await other.get("/api/dms")).json();
    expect(items[0].request).toBe(true);
    expect((await other.post(`/api/dms/${items[0].id}`, { data: { body: "that means a lot, thank you" } })).ok()).toBeTruthy();
    await expect(page.getByText("that means a lot, thank you")).toBeVisible({ timeout: 10_000 });
    // Nothing floats over the composer while a chat is open.
    await expect(page.getByRole("textbox", { name: "Message" })).toBeInViewport();
    await expect(page.getByText("Install AiTo on your phone")).toBeHidden();
    await page.screenshot({ path: info.outputPath("thread.png") });

    // Back in the inbox, then a new message from B shows as unread on the header icon.
    await page.getByRole("button", { name: "Back to messages" }).click();
    await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
    await other.post(`/api/dms/${items[0].id}`, { data: { body: "are you around?" } });
    await page.reload();
    await expect(page.getByRole("button", { name: "Messages, 1 unread" })).toBeVisible();
    await page.getByRole("button", { name: "Messages, 1 unread" }).click();
    await expect(page.getByText("are you around?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Voices", exact: true })).not.toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: info.outputPath("inbox.png") });
  } finally {
    await other.dispose();
  }
});
