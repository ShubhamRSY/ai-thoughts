import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

// SECURITY_AUDIT.md Low findings. Nothing here reaches an outside service.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let ipSeq = 0;
const nextIp = () => `10.88.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;

const guest = () =>
  pwRequest.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() } });

async function member(label: string): Promise<APIRequestContext> {
  const api = await guest();
  const email = `e2e-low-${label}-${uniq()}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return api;
}

test("L1: translation is for signed-in members only", async () => {
  const anon = await guest();
  expect((await anon.post("/api/translate", { data: { text: "hola" } })).status()).toBe(401);
  // English in, English out: answered without calling the translation service.
  const me = await member("translate");
  const res = await me.post("/api/translate", { data: { text: "hello", sourceLang: "en" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  expect((await res.json()).alreadyEnglish).toBe(true);
});

test("L2: the health secret is attempt-limited like the other bearer routes", async () => {
  const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-test-cron-secret";
  const probe = await guest();
  const detail = async (secret?: string) =>
    "indexes" in (await (await probe.get("/api/health", secret ? { headers: { Authorization: `Bearer ${secret}` } } : {})).json());
  expect(await detail(CRON_SECRET)).toBe(true);
  // Plain probes don't count against the budget…
  for (let i = 0; i < 25; i++) expect(await detail()).toBe(false);
  expect(await detail(CRON_SECRET)).toBe(true);
  // …guesses do: after 20 attempts from this IP even the right secret is refused.
  for (let i = 0; i < 20; i++) await detail(`wrong-${i}`);
  expect(await detail(CRON_SECRET)).toBe(false);
});
