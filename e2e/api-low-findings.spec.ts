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

test("L4: the temporary Sentry test page and route are gone", async () => {
  const anon = await guest();
  expect((await anon.get("/api/sentry-example-api")).status()).toBe(404);
  expect((await anon.get("/sentry-example-page")).status()).toBe(404);
});

test("L5: keepers see the reported take's own text, not the reporter's", async () => {
  const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-test-cron-secret";
  const keeper = await member("keeper");
  const me = await (await keeper.get("/api/auth/me")).json();
  const bs = await keeper.post("/api/admin/controls", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    data: { action: "bootstrap", handle: me.user.handle },
  });
  expect(bs.ok(), await bs.text()).toBeTruthy();

  const author = await member("author");
  const real = `e2e the real words ${uniq()}`;
  const created = await author.post("/api/posts", { data: { content: real, media_type: "text" } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const postId = (await created.json()).id;

  const reporter = await member("reporter");
  for (const [path, data] of [
    ["/api/reports", { target_type: "post", target_id: postId, reason: "Hate or harassment" }],
    [`/api/posts/${postId}/report`, { reason: "Hate or harassment" }],
  ] as const) {
    // Each route is used once per reporter, so use a fresh one for the second.
    const who = path === "/api/reports" ? reporter : await member("reporter2");
    const res = await who.post(path, { data: { ...data, content_snippet: "something the author never wrote" } });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  const rows = ((await (await keeper.get("/api/reports")).json()) as { post_id: string; content_snippet: string }[]).filter(
    (r) => r.post_id === postId
  );
  expect(rows.length).toBe(2);
  for (const r of rows) expect(r.content_snippet).toBe(real);
});

test("L6: guests can't add views", async () => {
  const author = await member("viewed");
  const created = await author.post("/api/posts", { data: { content: `e2e views ${uniq()}`, media_type: "text" } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const postId = (await created.json()).id;
  for (let i = 0; i < 5; i++) {
    const anon = await guest(); // a fresh cookie jar each time, as a script would
    expect((await anon.post(`/api/posts/${postId}/view`)).status()).toBe(401);
  }
  const reader = await member("reader");
  expect((await (await reader.post(`/api/posts/${postId}/view`)).json()).view_count).toBe(1);
});
