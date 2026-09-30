import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { MongoClient, ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";

// SECURITY_AUDIT.md H3: a file can only be attached by the person who
// uploaded it, only once, and deleting content never deletes someone else's
// file. A real upload needs Vercel Blob, which tests don't talk to, so the
// ownership rows /api/upload would write are inserted into the test DB
// directly. Every request here is refused (or deletes) before the server would
// fetch the file, so nothing leaves the machine.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const MONGO_URL =
  process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";
// The dev server (NODE_ENV=development) uses "<db>_dev" — dbName() in src/lib/mongodb.ts.
const MONGO_DB = ((b) => (b.endsWith("_dev") ? b : `${b}_dev`))(process.env.MONGODB_DB ?? "aithoughts-e2e");
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

type U = { api: APIRequestContext; handle: string; id: string };
let ipSeq = 0;
const nextIp = () => `10.83.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;

async function newUser(label: string): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
  });
  const email = `e2e-upl-${label}-${uniq()}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  expect((await api.put("/api/account/privacy", { data: { privacy: "public" } })).ok()).toBeTruthy();
  return { api, handle: user.handle as string, id: user.id as string };
}

let mongo: MongoClient;
const db = () => mongo.db(MONGO_DB);

/** What /api/upload records when `owner` starts an upload; returns the stored file URL. */
async function recordUpload(owner: U, kind: "take" | "avatar", attachedTo: string | null = null) {
  const uuid = randomUUID();
  await db().collection("uploads").insertOne({
    key: `u:${uuid}`,
    owner_id: owner.id,
    kind,
    private: kind === "take",
    created_at: new Date(),
    attached_to: attachedTo,
  });
  const host = kind === "take" ? "e2e.private" : "e2e.public";
  return { key: `u:${uuid}`, url: `https://${host}.blob.vercel-storage.com/${kind}-${uuid}-Ab12Cd.webm` };
}

const postWith = (u: U, media_url: string) =>
  u.api.post("/api/posts", { data: { content: `e2e upload probe ${uniq()}`, media_type: "audio", media_url } });

let victim: U, attacker: U;

test.beforeAll(async () => {
  mongo = new MongoClient(MONGO_URL, { tls: true });
  await mongo.connect();
  victim = await newUser("victim");
  attacker = await newUser("attacker");
});
test.afterAll(async () => {
  await mongo?.close();
});

test("someone else's take file can't be attached to your post", async () => {
  const file = await recordUpload(victim, "take");
  const res = await postWith(attacker, file.url);
  expect(res.status(), await res.text()).toBe(403);
  // Nor can a Blob URL nobody recorded.
  const unknown = await postWith(attacker, `https://e2e.private.blob.vercel-storage.com/take-${randomUUID()}-Zz.webm`);
  expect(unknown.status()).toBe(403);
});

test("a file already in one take can't go into another", async () => {
  const file = await recordUpload(victim, "take", new ObjectId().toString());
  const res = await postWith(victim, file.url);
  expect(res.status(), await res.text()).toBe(409);
});

test("someone else's photo can't become your avatar, nor a take file", async () => {
  const photo = await recordUpload(victim, "avatar");
  const put = (avatarUrl: string) => attacker.api.put("/api/profile", { data: { author: "Upload test", avatarUrl } });
  expect((await put(photo.url)).status()).toBe(403);
  const ownTake = await recordUpload(attacker, "take");
  expect((await put(ownTake.url)).status()).toBe(400);
});

test("deleting a post removes only its author's files", async () => {
  // Residue of the old bug: a post that already embeds the victim's file.
  const victimFile = await recordUpload(victim, "take");
  const ownFile = await recordUpload(attacker, "take");
  const insert = (media_url: string) =>
    db()
      .collection("posts")
      .insertOne({
        user_id: attacker.id,
        handle: attacker.handle,
        author: "Upload test",
        content: `e2e seeded ${uniq()}`,
        media_type: "audio",
        media_url,
        created_at: new Date(),
      });
  const stolen = await insert(victimFile.url);
  const own = await insert(ownFile.url);

  expect((await attacker.api.delete(`/api/posts/${stolen.insertedId}`)).ok()).toBeTruthy();
  expect((await attacker.api.delete(`/api/posts/${own.insertedId}`)).ok()).toBeTruthy();

  // The victim's file is left alone (its record stays); the attacker's own went with the post.
  expect(await db().collection("uploads").countDocuments({ key: victimFile.key })).toBe(1);
  expect(await db().collection("uploads").countDocuments({ key: ownFile.key })).toBe(0);
});

test("a quoted take from an account that went private isn't served to strangers", async () => {
  const author = await newUser("author");
  const orig = await author.api.post("/api/posts", { data: { content: `e2e original ${uniq()}`, media_type: "text" } });
  expect(orig.ok(), await orig.text()).toBeTruthy();
  const origId = (await orig.json()).id as string;
  const quoter = await newUser("quoter");
  const q = await quoter.api.post("/api/posts", {
    data: { content: `e2e quoting ${uniq()}`, media_type: "text", quoted_post_id: origId },
  });
  expect(q.ok(), await q.text()).toBeTruthy();
  const quoteId = (await q.json()).id as string;

  expect((await author.api.put("/api/account/privacy", { data: { privacy: "private" } })).ok()).toBeTruthy();
  const stranger = await newUser("stranger");
  const feed = await (await stranger.api.get(`/api/posts?handle=${encodeURIComponent(quoter.handle)}`)).json();
  const posts = (Array.isArray(feed) ? feed : feed.posts) as { id: string; quoted_post: unknown }[];
  const quote = posts.find((p) => p.id === quoteId);
  expect(quote, "the quoting take itself is still public").toBeTruthy();
  expect(quote!.quoted_post).toBeNull();
});
