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

test.describe("reported chats", () => {
  const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-test-cron-secret";
  let K: U, D: U, E: U;

  test.beforeAll(async () => {
    K = await newUser("keeper", "10.83.1.1");
    D = await newUser("d", "10.83.1.2");
    E = await newUser("e", "10.83.1.3");
    // Dev break-glass bootstrap: an admin has keeper powers.
    const bs = await K.api.post("/api/admin/controls", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      data: { action: "bootstrap", handle: K.handle },
    });
    expect(bs.ok(), await bs.text()).toBeTruthy();
  });

  test.afterAll(async () => {
    await Promise.all([K, D, E].map((u) => u?.api.dispose()));
  });

  const report = (u: U, convId: string, reason = "Hate or harassment") =>
    u.api.post("/api/reports", { data: { target_type: "chat", target_id: convId, reason } });

  test("a member reports a chat; only a keeper reads it, and only up to the report", async () => {
    const { conversation_id: id } = await (await send(D, E, "you people are pathetic")).json();

    // Only members can report it.
    expect((await report(C, id)).status()).toBe(404);
    expect((await report(E, id)).ok()).toBeTruthy();

    // Sent after the report: not part of what keepers see.
    expect((await send(D, E, "sent after the report")).ok()).toBeTruthy();

    const row = (await (await K.api.get("/api/reports")).json()).find(
      (r: { target_type: string; post_id: string }) => r.target_type === "chat" && r.post_id === id
    );
    expect(row).toMatchObject({ reported_handle: D.handle, content_snippet: "you people are pathetic" });

    // Members and strangers can't use the keeper view.
    expect((await E.api.get(`/api/reports/${row.id}/chat`)).status()).toBe(403);

    const chat = await (await K.api.get(`/api/reports/${row.id}/chat`)).json();
    expect(chat.preserved).toBe(false);
    expect(chat.messages).toEqual([
      expect.objectContaining({ from: D.handle, reported: true, body: "you people are pathetic" }),
    ]);

    // Post-only actions don't apply; banning the account does.
    expect((await K.api.post(`/api/reports/${row.id}?action=remove_post`)).status()).toBe(400);
    expect((await K.api.post(`/api/reports/${row.id}?action=ban`)).ok()).toBeTruthy();
  });

  test("a chat reported for child safety survives the reported account's deletion", async () => {
    const F = await newUser("f", "10.83.1.4");
    const G = await newUser("g", "10.83.1.5");
    try {
      const { conversation_id: id } = await (await send(F, G, "evidence message")).json();
      expect((await report(G, id, "Child safety")).ok()).toBeTruthy();
      expect((await F.api.delete("/api/account", { data: { confirm: "DELETE" } })).ok()).toBeTruthy();

      // Gone for the other member…
      expect((await G.api.get(`/api/dms/${id}`)).status()).toBe(404);
      // …but preserved for keepers.
      const row = (await (await K.api.get("/api/reports")).json()).find((r: { post_id: string }) => r.post_id === id);
      const chat = await (await K.api.get(`/api/reports/${row.id}/chat`)).json();
      expect(chat.preserved).toBe(true);
      expect(chat.messages.map((m: { body: string }) => m.body)).toEqual(["evidence message"]);
    } finally {
      await Promise.all([F.api.dispose(), G.api.dispose()]);
    }
  });
});
