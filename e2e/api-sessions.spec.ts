import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";

// Session management: list devices, revoke one / all others / everything, and
// keep legacy (pre-session-store) cookies working until they're upgraded or
// revoked. Sign-in is capped (per email: 3 / 15 min, globally: 40 / hour), so
// each test signs in only as many devices as it needs.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
// Must match the server's AUTH_SECRET (see playwright.config.ts).
const SECRET = process.env.AUTH_SECRET ?? "e2e-test-secret-not-for-prod";
const COOKIE = "aithoughts.session";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

type Device = {
  api: APIRequestContext;
  user: { id: string; handle: string; displayName: string };
};
const opened: APIRequestContext[] = [];

async function ctx(ua: string, ip: string, cookies: { name: string; value: string }[] = []) {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip, "User-Agent": ua },
    storageState: {
      cookies: cookies.map((c) => ({
        ...c,
        domain: new URL(ORIGIN).hostname,
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      })),
      origins: [],
    },
  });
  opened.push(api);
  return api;
}

async function signIn(email: string, ua: string, ip: string): Promise<Device> {
  const api = await ctx(ua, ip);
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return { api, user: (await verify.json()).user };
}

const uniqueEmail = (label: string) =>
  `e2e-sess-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const alive = async (d: { api: APIRequestContext }) => (await d.api.get("/api/prefs")).status();
const list = async (d: Device) => (await d.api.get("/api/account/sessions")).json();
const act = (d: Device, body: object) => d.api.post("/api/account/sessions", { data: body });

async function cookieOf(d: { api: APIRequestContext }) {
  const state = await d.api.storageState();
  return state.cookies.find((c) => c.name === COOKIE)!.value;
}

/** A pre-session-store cookie: signed, no sid, no iat. */
function legacyToken(u: Device["user"]) {
  const encoded = Buffer.from(
    JSON.stringify({
      id: u.id,
      handle: u.handle,
      displayName: u.displayName,
      exp: Date.now() + 90 * 24 * 3600 * 1000,
    })
  ).toString("base64url");
  return `${encoded}.${createHmac("sha256", SECRET).update(encoded).digest("hex")}`;
}

test.afterAll(async () => {
  await Promise.all(opened.map((a) => a.dispose()));
});

test("sessions: a user sees their devices, and can end one without touching anyone else's", async () => {
  const email = uniqueEmail("a");
  const mac = await signIn(email, CHROME_MAC, "10.81.0.1");
  const linux = await signIn(email, FIREFOX_LINUX, "10.81.0.2");
  const stranger = await signIn(uniqueEmail("b"), SAFARI_IOS, "10.81.0.3");

  const { sessions, current } = await list(mac);
  expect(sessions.map((s: { label: string }) => s.label).sort()).toEqual([
    "Chrome on macOS",
    "Firefox on Linux",
  ]);
  expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
  expect(sessions.find((s: { current: boolean }) => s.current).sid).toBe(current);

  // Re-issuing the cookie (the app calls /api/auth/me on every load) must not spawn sessions.
  await mac.api.get("/api/auth/me");
  await mac.api.get("/api/auth/me");
  expect((await list(mac)).sessions).toHaveLength(2);

  // Someone else's session id is indistinguishable from a nonexistent one.
  const strangerSid = (await list(stranger)).current;
  expect((await act(mac, { action: "revoke", sid: strangerSid })).status()).toBe(404);
  expect(await alive(stranger)).toBe(200);

  const linuxSid = sessions.find((s: { label: string }) => s.label === "Firefox on Linux").sid;
  expect((await act(mac, { action: "revoke", sid: linuxSid })).ok()).toBeTruthy();
  expect(await alive(linux)).toBe(401);
  expect(await alive(mac)).toBe(200);
  expect((await list(mac)).sessions).toHaveLength(1);
});

test("sessions: sign out other devices keeps this one; sign out ends the session server-side", async () => {
  const email = uniqueEmail("c");
  const one = await signIn(email, CHROME_MAC, "10.81.0.4");
  const two = await signIn(email, FIREFOX_LINUX, "10.81.0.5");
  const three = await signIn(email, SAFARI_IOS, "10.81.0.6");

  expect((await act(one, { action: "revoke_others" })).ok()).toBeTruthy();
  expect(await alive(two)).toBe(401);
  expect(await alive(three)).toBe(401);
  // The current cookie was re-issued after the account-wide stamp, so it survives.
  expect(await alive(one)).toBe(200);
  expect((await list(one)).sessions).toHaveLength(1);

  // A copied cookie is dead once its owner signs out — the row is gone, not just the browser cookie.
  const copied = await cookieOf(one);
  expect((await one.api.post("/api/auth/sign-out")).ok()).toBeTruthy();
  const replay = await ctx(CHROME_MAC, "10.81.0.7", [{ name: COOKIE, value: copied }]);
  expect(await alive({ api: replay })).toBe(401);
});

test("sessions: legacy cookies keep working, get upgraded, and die on sign out everywhere", async () => {
  const seed = await signIn(uniqueEmail("d"), CHROME_MAC, "10.81.0.8");
  const token = legacyToken(seed.user);

  const legacy = await ctx(FIREFOX_LINUX, "10.81.0.9", [{ name: COOKIE, value: token }]);
  expect(await alive({ api: legacy })).toBe(200); // still valid, no sid yet

  // /api/auth/me is called on every app load: it upgrades the cookie to a tracked session.
  await legacy.get("/api/auth/me");
  const { sessions, current } = await (await legacy.get("/api/account/sessions")).json();
  expect(current).toBeTruthy();
  expect(sessions.map((s: { label: string }) => s.label)).toContain("Firefox on Linux");

  // A second copy of the ORIGINAL legacy cookie (e.g. on another device) is still accepted...
  const otherCopy = await ctx(CHROME_MAC, "10.81.0.10", [{ name: COOKIE, value: token }]);
  expect(await alive({ api: otherCopy })).toBe(200);

  // ...until "sign out everywhere", which is the only thing that can end sid-less tokens.
  expect((await legacy.post("/api/account/sessions", { data: { action: "revoke_all" } })).ok()).toBeTruthy();
  expect(await alive({ api: otherCopy })).toBe(401);
  expect(await alive({ api: legacy })).toBe(401);
  expect(await alive(seed)).toBe(401);
});
