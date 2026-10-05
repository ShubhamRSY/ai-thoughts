import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { FLAG_MARKER } from "./fake-moderation";

// SECURITY_AUDIT.md M2: edits and replies go through the same AI screening
// as new takes. Screening here is the local fake in e2e/fake-moderation.ts,
// which flags text containing FLAG_MARKER.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let ipSeq = 0;
const nextIp = () => `10.84.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;

async function newUser(label: string): Promise<APIRequestContext> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
  });
  const email = `e2e-mod-${label}-${uniq()}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  return api;
}

let author: APIRequestContext;
let postId: string;
const clean = `e2e screening probe ${uniq()}`;

test.beforeAll(async () => {
  author = await newUser("author");
  const res = await author.post("/api/posts", { data: { content: clean, media_type: "text" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  postId = (await res.json()).id;
});

test("a new take with flagged text is refused (the shared path)", async () => {
  const other = await newUser("creator");
  const res = await other.post("/api/posts", { data: { content: `hello ${FLAG_MARKER}`, media_type: "text" } });
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe("flagged");
});

test("editing a take into flagged text is refused and nothing changes", async () => {
  const res = await author.patch(`/api/posts/${postId}`, { data: { content: `now ${FLAG_MARKER}` } });
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe("flagged");
  const stored = await (await author.get(`/api/posts/${postId}`)).json();
  expect(stored.content).toBe(clean);

  const ok = await author.patch(`/api/posts/${postId}`, { data: { content: `${clean} (edited)` } });
  expect(ok.status(), await ok.text()).toBe(200);
});

test("a flagged reply is refused; a clean one posts", async () => {
  const replier = await newUser("replier");
  const bad = await replier.post(`/api/posts/${postId}/messages`, { data: { body: `reply ${FLAG_MARKER}` } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).code).toBe("flagged");
  const good = await replier.post(`/api/posts/${postId}/messages`, { data: { body: "a kind reply" } });
  expect(good.ok(), await good.text()).toBeTruthy();
  const bodies = (await (await replier.get(`/api/posts/${postId}/messages`)).json()).map((m: { body: string }) => m.body);
  expect(bodies).toEqual(["a kind reply"]);
});

test("edits are rate limited per account", async () => {
  const editor = await newUser("editor");
  const res = await editor.post("/api/posts", { data: { content: `e2e edit limit ${uniq()}`, media_type: "text" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const id = (await res.json()).id;
  const statuses: number[] = [];
  for (let i = 0; i < 31; i++) {
    statuses.push((await editor.patch(`/api/posts/${id}`, { data: { content: `e2e edit limit v${i} ${uniq()}` } })).status());
  }
  expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
  expect(statuses[30]).toBe(429);
});

test("a flagged custom feeling is refused, even with clean take text", async () => {
  const creator = await newUser("feeling"); // its own account: takes have a daily cap
  const res = await creator.post("/api/posts", {
    data: { content: `clean words ${uniq()}`, media_type: "text", feeling: "custom", custom_feeling: FLAG_MARKER },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe("flagged");
});

test("a flagged display name or bio is refused; a clean one saves", async () => {
  const user = await newUser("profile");
  const badName = await user.put("/api/profile", { data: { author: `Name ${FLAG_MARKER}` } });
  expect(badName.status()).toBe(400);
  expect((await badName.json()).error).toMatch(/name or bio breaks/); // the AI screen, not the word filter
  const badBio = await user.put("/api/profile", { data: { author: "Kind Person", bio: `bio ${FLAG_MARKER}` } });
  expect(badBio.status()).toBe(400);
  const ok = await user.put("/api/profile", { data: { author: "Kind Person", bio: "I like quiet mornings." } });
  expect(ok.status(), await ok.text()).toBe(200);
});
