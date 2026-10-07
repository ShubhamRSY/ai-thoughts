import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { MongoClient, ObjectId } from "mongodb";

// Three leaks found re-auditing the app after the SECURITY_AUDIT.md fixes
// (which are all verified in place). Each test fails on the code as it was:
//
//  1. admin `delete_post` used a bare deleteOne, skipping deletePostCascade —
//     so no child-safety evidence copy was kept and the blob file was orphaned.
//  2. /api/feelings/spectrum aggregated feelings from private and locked
//     accounts (and was publicly cacheable) into a tally any member could read.
//  3. a suspended account kept appearing in /api/people and /api/search,
//     because banUser leaves the profiles row and only the users query
//     filtered `suspended`.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-test-cron-secret";
const MONGO_URL =
  process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";
const MONGO_DB = ((b) => (b.endsWith("_dev") ? b : `${b}_dev`))(process.env.MONGODB_DB ?? "aithoughts-e2e");
const CS = "Child safety";
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let ipSeq = 0;
const nextIp = () => `10.91.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");

type U = { api: APIRequestContext; handle: string; id: string };
let mongo: MongoClient;
const db = () => mongo.db(MONGO_DB);

async function newUser(label: string): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
  });
  const email = `e2e-leak-${label}-${uniq()}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  return { api, handle: user.handle, id: user.id };
}

let admin: U;
test.beforeAll(async () => {
  mongo = new MongoClient(MONGO_URL, { tls: true });
  await mongo.connect();
  admin = await newUser("admin");
  const res = await admin.api.post("/api/admin/controls", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    data: { action: "bootstrap", handle: admin.handle },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
});
test.afterAll(async () => {
  await mongo?.close();
});

test.describe("1. admin delete_post runs the full cascade", () => {
  test("keeps child-safety evidence and clears the take's dependent rows", async () => {
    const author = await newUser("cascade-author");
    const res = await author.api.post("/api/posts", {
      data: { content: `e2e cascade probe ${uniq()}`, media_type: "text" },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const postId = (await res.json()).id as string;

    // Someone replies and reports it for child safety, so there is something
    // that must survive the deletion.
    const replier = await newUser("cascade-reply");
    const reply = await replier.api.post(`/api/posts/${postId}/messages`, {
      data: { body: "a reply that must be cleaned up" },
    });
    expect(reply.ok(), await reply.text()).toBeTruthy();
    const reporter = await newUser("cascade-reporter");
    const report = await reporter.api.post("/api/reports", {
      data: { target_type: "post", target_id: postId, reason: CS },
    });
    expect(report.ok(), await report.text()).toBeTruthy();

    const del = await admin.api.post("/api/admin/controls", {
      data: { action: "delete_post", postId },
    });
    expect(del.ok(), await del.text()).toBeTruthy();

    // The take is gone…
    expect(await db().collection("posts").findOne({ _id: new ObjectId(postId) })).toBeNull();
    // …and so is everything hanging off it.
    expect(await db().collection("messages").countDocuments({ post_id: postId })).toBe(0);
    expect(await db().collection("reports").countDocuments({ post_id: postId })).toBe(0);
    expect(await db().collection("notifications").countDocuments({ post_id: postId })).toBe(0);
    // …but the child-safety evidence was preserved first. Before the fix this
    // was empty, because a bare deleteOne never called preserveChildSafetyEvidence.
    const evidence = await db().collection("evidence").findOne({ post_id: postId });
    expect(evidence, "child-safety evidence must be preserved before deletion").toBeTruthy();
    expect(evidence?.preserved_by).toBe(admin.handle);
  });
});

test.describe("2. feeling spectrum respects private and locked accounts", () => {
  const countFor = (tally: { id: string; count: number }[], id: string) =>
    tally.find((t) => t.id === id)?.count ?? 0;

  test("a private account's take and tap drop out of another member's tally", async () => {
    const hidden = await newUser("spectrum-private");
    const viewer = await newUser("spectrum-viewer");
    const feeling = "hurts";
    const tallyFor = async (u: U) => {
      const { tally } = (await (await u.api.get("/api/feelings/spectrum")).json()) as {
        tally: { id: string; count: number }[];
      };
      return countFor(tally, feeling);
    };

    // Public to begin with, so both the take and the tap are counted.
    await hidden.api.put("/api/account/privacy", { data: { privacy: "public" } });
    const post = await hidden.api.post("/api/posts", {
      data: { content: `e2e spectrum probe ${uniq()}`, media_type: "text", feeling },
    });
    expect(post.ok(), await post.text()).toBeTruthy();
    const day = new Date().toISOString().slice(0, 10);
    expect(
      (await hidden.api.post("/api/mood", { data: { feelings: [feeling], day } })).ok()
    ).toBeTruthy();

    // Deltas, not absolutes: other suites share this database. While the
    // account is public the author and a stranger see the same tally.
    const publicCount = await tallyFor(viewer);
    const authorPublic = await tallyFor(hidden);
    expect(authorPublic - publicCount, "while public, author and stranger agree").toBe(0);

    await hidden.api.put("/api/account/privacy", { data: { privacy: "private" } });

    // Now the stranger loses both the take and the tap…
    expect(publicCount - (await tallyFor(viewer)), "private data must leave the tally").toBe(2);
    // …while the author still sees their own.
    expect(authorPublic - (await tallyFor(hidden)), "the author keeps their own").toBe(0);

    const asViewer = await viewer.api.get("/api/feelings/spectrum");
    // A per-viewer tally must not be stored by a shared cache.
    expect(asViewer.headers()["cache-control"]).toContain("no-store");
  });

  test("a locked account's take leaves the tally too", async () => {
    const locked = await newUser("spectrum-locked");
    const viewer = await newUser("spectrum-locked-viewer");
    const feeling = "need-support";
    const tallyFor = async (u: U) => {
      const { tally } = (await (await u.api.get("/api/feelings/spectrum")).json()) as {
        tally: { id: string; count: number }[];
      };
      return countFor(tally, feeling);
    };

    await locked.api.put("/api/account/privacy", { data: { privacy: "public" } });
    expect(
      (await locked.api.post("/api/posts", { data: { content: `e2e locked ${uniq()}`, media_type: "text", feeling } }))
        .ok()
    ).toBeTruthy();
    const withPost = await tallyFor(viewer);
    expect((await tallyFor(locked)) - withPost, "public: counted for everyone").toBe(0);

    await locked.api.put("/api/account/privacy", { data: { privacy: "locked" } });
    expect(withPost - (await tallyFor(viewer)), "locked data must leave the tally").toBe(1);
  });

  test("guests are refused", async () => {
    const guest = await pwRequest.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
    });
    const res = await guest.get("/api/feelings/spectrum");
    expect(res.status()).toBe(401);
    await guest.dispose();
  });
});

test.describe("3. a suspended account disappears from people and search", () => {
  test("banned handle is not listed or searchable, and cannot be followed", async () => {
    const victim = await newUser("banned");
    const viewer = await newUser("banned-viewer");
    const q = norm(victim.handle);

    const inPeople = async () => {
      const { people } = (await (await viewer.api.get(`/api/people?q=${encodeURIComponent(q)}`)).json()) as {
        people: { handle: string }[];
      };
      return people.some((p) => norm(p.handle) === q);
    };
const inSearch = async () => {
      const { people } = await (await viewer.api.get(`/api/search?q=${encodeURIComponent(q)}`)).json() as {
        people: { handle: string }[];
      };
      return people.some((p) => norm(p.handle) === q);
    };
    const profile = async () =>
      (await (await viewer.api.get(`/api/profile?handle=${encodeURIComponent(victim.handle)}`)).json())
        .profile;

    // A real account has a profiles row once onboarded. Users created here
    // skip that step, so give the victim one — the leak under test is that a
    // suspended account still answers on /api/profile even though this row
    // lives on after a ban.
    await db()
      .collection("profiles")
      .updateOne({ handle: victim.handle }, { $set: { author: victim.handle, bio: "e2e" } }, { upsert: true });

    // Visible while active.
    expect(await inPeople()).toBe(true);
    expect(await profile(), "an active account's profile shell is visible").not.toBeNull();

    // Suspend directly in the DB — banUser is the route under test elsewhere,
    // and this is the state a ban leaves behind (posts removed, profiles row kept).
    await db()
      .collection("users")
      .updateOne({ _id: new ObjectId(victim.id) }, { $set: { suspended: true } });
    await db()
      .collection("profiles")
      .updateOne({ handle: victim.handle }, { $set: { author: victim.handle } }, { upsert: true });

    expect(await inPeople(), "a banned account must not appear in people search").toBe(false);
    expect(await inSearch(), "a banned account must not appear in search").toBe(false);
    expect(await profile(), "a banned account's profile must look gone too").toBeNull();

    const follow = await viewer.api.post("/api/follows", {
      data: { handle: victim.handle, action: "follow" },
    });
    expect(follow.ok(), "a banned account must not be followable").toBe(false);
  });
});
