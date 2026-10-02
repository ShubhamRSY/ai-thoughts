import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

// Direct messages: requests from strangers, direct delivery from people the
// recipient follows, the request cap, accept-by-reply, delete-for-me, blocks,
// and locked accounts.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;

type U = { api: APIRequestContext; handle: string };
let A: U, B: U, C: U;

async function newUser(label: string, ip: string): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": ip },
  });
  const email = `e2e-dm-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return { api, handle: (await verify.json()).user.handle as string };
}

const send = (from: U, to: U, body: string) => from.api.post("/api/dms", { data: { to: to.handle, body } });
const inbox = async (u: U) => (await u.api.get("/api/dms")).json();

test.beforeAll(async () => {
  A = await newUser("a", "10.83.0.1");
  B = await newUser("b", "10.83.0.2");
  C = await newUser("c", "10.83.0.3");
});

test.afterAll(async () => {
  await Promise.all([A, B, C].map((u) => u?.api.dispose()));
});

test("a stranger's message is a request, capped until accepted; replying accepts", async () => {
  const first = await send(A, B, "your take on AI art hit me");
  expect(first.ok(), await first.text()).toBeTruthy();
  const { conversation_id: id } = await first.json();

  // B sees it under Requests, not as an unread chat.
  const bInbox = await inbox(B);
  expect(bInbox.requests).toBe(1);
  expect(bInbox.unread).toBe(0);
  expect(bInbox.items[0]).toMatchObject({ id, request: true, unread: true });

  // A gets 3 messages before B accepts.
  expect((await send(A, B, "two")).ok()).toBeTruthy();
  expect((await send(A, B, "three")).ok()).toBeTruthy();
  expect((await send(A, B, "four")).status()).toBe(429);

  // B replies → accepted; A can keep talking.
  const reply = await B.api.post(`/api/dms/${id}`, { data: { body: "thank you, same here" } });
  expect(reply.ok(), await reply.text()).toBeTruthy();
  expect((await inbox(B)).requests).toBe(0);
  expect((await send(A, B, "four, now that we're talking")).ok()).toBeTruthy();

  const thread = await (await A.api.get(`/api/dms/${id}`)).json();
  expect(thread.messages.map((m: { body: string }) => m.body)).toEqual([
    "your take on AI art hit me",
    "two",
    "three",
    "thank you, same here",
    "four, now that we're talking",
  ]);
  expect(thread.messages[3].from_me).toBe(false);

  // Polling with ?since returns only newer messages.
  const since = thread.messages[4].created_at;
  expect((await (await A.api.get(`/api/dms/${id}?since=${encodeURIComponent(since)}`)).json()).messages).toEqual([]);
});

test("someone you follow messages you directly, and only members can read a thread", async () => {
  expect((await C.api.post("/api/follows", { data: { handle: A.handle, action: "follow" } })).ok()).toBeTruthy();
  const res = await send(A, C, "hi C");
  const { conversation_id: id } = await res.json();
  const cInbox = await inbox(C);
  expect(cInbox.items.find((i: { id: string }) => i.id === id)).toMatchObject({ request: false, unread: true });
  expect(cInbox.unread).toBe(1);

  // Opening it marks it read.
  await C.api.get(`/api/dms/${id}`);
  expect((await inbox(C)).unread).toBe(0);

  // B is not in this conversation.
  expect((await B.api.get(`/api/dms/${id}`)).status()).toBe(404);
  expect((await B.api.post(`/api/dms/${id}`, { data: { body: "hi" } })).status()).toBe(404);
});

test("delete hides it for me only, until a new message arrives", async () => {
  const { items } = await inbox(C);
  const id = items[0].id;
  expect((await C.api.post(`/api/dms/${id}`, { data: { action: "delete" } })).ok()).toBeTruthy();
  expect((await inbox(C)).items.some((i: { id: string }) => i.id === id)).toBe(false);
  expect((await inbox(A)).items.some((i: { id: string }) => i.id === id)).toBe(true);
  await send(A, C, "still here");
  expect((await inbox(C)).items.some((i: { id: string }) => i.id === id)).toBe(true);
});

test("can't message yourself, blocked accounts, or a locked stranger", async () => {
  expect((await send(A, A, "me")).status()).toBe(400);
  expect((await A.api.post("/api/dms", { data: { to: "@nobody-here-xyz", body: "hi" } })).status()).toBe(404);
  expect((await A.api.post("/api/dms", { data: { to: B.handle, body: "   " } })).status()).toBe(400);

  // B blocks A: A can't start or continue, and the chat leaves both inboxes.
  expect((await B.api.post("/api/blocks", { data: { handle: A.handle, action: "block" } })).ok()).toBeTruthy();
  expect((await send(A, B, "hello?")).status()).toBe(403);
  const ab = (await inbox(A)).items.find((i: { other: { handle: string } }) => i.other.handle === B.handle);
  expect(ab).toBeUndefined();

  // C goes locked; B (whom C doesn't follow) can't message C.
  expect((await C.api.put("/api/account/privacy", { data: { privacy: "locked" } })).ok()).toBeTruthy();
  expect((await send(B, C, "hi")).status()).toBe(403);
});
