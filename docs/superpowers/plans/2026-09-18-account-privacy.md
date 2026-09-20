# Account privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user set their account to public / private / locked and enforce it on every route that returns their posts or identity.

**Architecture:** `profiles.privacy` + `follows.status` in Mongo. One module, `src/lib/visibility.ts`, holds a pure decision function (unit tested) and thin DB wrappers; every read route calls it. Feed-style queries exclude restricted authors up front via `hiddenAuthorFilter` so `limit` still fills.

**Tech Stack:** Next.js (App Router, `src/proxy.ts`), MongoDB driver, `node --test` for unit tests, Playwright request contexts for API e2e.

**Spec:** `docs/superpowers/specs/2026-09-18-account-privacy-design.md`

## Global Constraints

- No commits or pushes unless the user asks; each task ends at a verification checkpoint.
- Missing `profiles.privacy` means `public`; missing `follows.status` means `approved` (no backfill).
- Filter follows with `status: { $ne: "pending" }`, never `status: "approved"`, so legacy rows count.
- Handles are stored as `@x`, `x` or mixed; always look up with `{ $in: variants }`.
- Unit tests import with the `.ts` extension and run under `node --experimental-strip-types`; a module that a unit test imports must not use the `@/` alias.
- API e2e requests must send an `Origin` header (see `src/proxy.ts` CSRF check).
- Moderator routes (`/admin`, `/keeper`, `/owner`) are unchanged.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/visibility.ts` (new) | Privacy types, pure decisions, DB wrappers, `hiddenAuthorFilter` |
| `src/lib/visibility.test.ts` (new) | Unit tests for the pure functions |
| `src/lib/follows.ts` | Approved-only lists, pending/approve/decline, follow state, `resolveProfiles` |
| `src/app/api/account/privacy/route.ts` (new) | `GET`/`PUT` caller's privacy |
| `src/app/api/follows/route.ts`, `follows/requests/route.ts` (new) | Follow flow + requests list |
| `src/app/api/posts/**`, `profile`, `people`, `prompt/peers`, `cron/weekly-voices`, `src/lib/activity.ts` | Enforcement |
| `e2e/api-privacy.spec.ts` (new) | End-to-end privacy behaviour |
| `src/components/AccountCenter.tsx` (new), `ProfileView.tsx`, `src/lib/db.ts`, `src/app/app/page.tsx` | UI |

---

### Task 1: Pure visibility logic

**Files:**
- Create: `src/lib/visibility.ts`
- Create: `src/lib/visibility.test.ts`
- Modify: `package.json:13` (add the test file to the `test` script)

**Interfaces:**
- Produces:
  - `type Privacy = "public" | "private" | "locked"`, `PRIVACY_LEVELS`, `parsePrivacy(v: unknown): Privacy`
  - `decideVisibility(privacy: Privacy, rel: { isSelf: boolean; isApprovedFollower: boolean }): { posts: boolean; profile: boolean; lists: boolean; searchable: boolean }`
  - `followStatusFor(privacy: Privacy): "approved" | "pending" | null` (`null` = follows rejected)
  - `pendingActionFor(to: Privacy): "approve" | "decline" | "none"`
  - `canBeReposted(privacy: Privacy): boolean`

- [ ] **Step 1: Write the failing test** — `src/lib/visibility.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideVisibility,
  followStatusFor,
  pendingActionFor,
  canBeReposted,
  parsePrivacy,
} from "./visibility.ts";

const stranger = { isSelf: false, isApprovedFollower: false };
const follower = { isSelf: false, isApprovedFollower: true };
const self = { isSelf: true, isApprovedFollower: false };

test("public: everything visible to everyone", () => {
  assert.deepEqual(decideVisibility("public", stranger), {
    posts: true, profile: true, lists: true, searchable: true,
  });
});

test("private: stranger sees the shell and search, not posts or lists", () => {
  assert.deepEqual(decideVisibility("private", stranger), {
    posts: false, profile: true, lists: false, searchable: true,
  });
});

test("locked: stranger sees nothing and cannot search", () => {
  assert.deepEqual(decideVisibility("locked", stranger), {
    posts: false, profile: false, lists: false, searchable: false,
  });
});

test("approved followers and self see everything on every level", () => {
  for (const p of ["public", "private", "locked"] as const) {
    for (const rel of [follower, self]) {
      assert.deepEqual(decideVisibility(p, rel), {
        posts: true, profile: true, lists: true, searchable: true,
      });
    }
  }
});

test("follow status per privacy level", () => {
  assert.equal(followStatusFor("public"), "approved");
  assert.equal(followStatusFor("private"), "pending");
  assert.equal(followStatusFor("locked"), null);
});

test("privacy transitions resolve pending requests", () => {
  assert.equal(pendingActionFor("public"), "approve");
  assert.equal(pendingActionFor("locked"), "decline");
  assert.equal(pendingActionFor("private"), "none");
});

test("only public takes can be reposted or quoted", () => {
  assert.equal(canBeReposted("public"), true);
  assert.equal(canBeReposted("private"), false);
  assert.equal(canBeReposted("locked"), false);
});

test("parsePrivacy defaults anything unknown to public", () => {
  assert.equal(parsePrivacy(undefined), "public");
  assert.equal(parsePrivacy("bogus"), "public");
  assert.equal(parsePrivacy("private"), "private");
  assert.equal(parsePrivacy("locked"), "locked");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --experimental-strip-types --test src/lib/visibility.test.ts`
Expected: FAIL, cannot find module `./visibility.ts`.

- [ ] **Step 3: Write the pure half of `src/lib/visibility.ts`**

```ts
export type Privacy = "public" | "private" | "locked";
export const PRIVACY_LEVELS: readonly Privacy[] = ["public", "private", "locked"];

export function parsePrivacy(v: unknown): Privacy {
  return v === "private" || v === "locked" ? v : "public";
}

export interface ViewerRelation {
  isSelf: boolean;
  isApprovedFollower: boolean;
}

export interface Visibility {
  posts: boolean;
  profile: boolean;
  lists: boolean;
  searchable: boolean;
}

export function decideVisibility(privacy: Privacy, rel: ViewerRelation): Visibility {
  const trusted = rel.isSelf || rel.isApprovedFollower;
  return {
    posts: privacy === "public" || trusted,
    profile: privacy !== "locked" || trusted,
    lists: privacy === "public" || trusted,
    searchable: privacy !== "locked" || trusted,
  };
}

export type FollowStatus = "approved" | "pending";

/** Status a brand-new follow row gets; `null` means the account rejects follows. */
export function followStatusFor(privacy: Privacy): FollowStatus | null {
  if (privacy === "locked") return null;
  return privacy === "private" ? "pending" : "approved";
}

/** What to do with pending requests when an account switches to `to`. */
export function pendingActionFor(to: Privacy): "approve" | "decline" | "none" {
  if (to === "public") return "approve";
  if (to === "locked") return "decline";
  return "none";
}

export function canBeReposted(privacy: Privacy): boolean {
  return privacy === "public";
}
```

- [ ] **Step 4: Register the test in `package.json`** — append ` src/lib/visibility.test.ts` to the end of the `"test"` script's file list.

- [ ] **Step 5: Verify**

Run: `npm test`
Expected: all pass (57 existing + 8 new).

---

### Task 2: DB layer, follow flow, privacy endpoint

**Files:**
- Modify: `src/lib/visibility.ts` (append DB half)
- Modify: `src/lib/follows.ts`
- Modify: `src/lib/indexes.ts:42` (add a `profiles_privacy` index)
- Modify: `src/app/api/follows/route.ts`
- Create: `src/app/api/follows/requests/route.ts`
- Create: `src/app/api/account/privacy/route.ts`
- Create: `e2e/api-privacy.spec.ts`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces (`visibility.ts`):
  - `handleVariants(h: string): string[]`
  - `getPrivacy(db: Db, handle: string): Promise<Privacy>`
  - `getVisibility(db, viewer: string | null, owner: string): Promise<Visibility & { privacy: Privacy }>`
  - `canViewPosts(db, viewer: string | null, owner: string): Promise<boolean>`
  - `postHiddenFrom(db, viewer: string | null, postId: string): Promise<boolean>` (true only if the post exists and the viewer can't see it)
  - `hiddenHandles(db, viewer: string | null, levels?: Privacy[]): Promise<string[]>` (default levels `["private","locked"]`)
  - `hiddenAuthorFilter(db, viewer: string | null): Promise<Record<string, unknown>>` (`{}` or `{ handle: { $nin: [...] } }`)
- Produces (`follows.ts`): `resolveProfiles(db, handles)`, `listPendingRequests(db, owner): string[]`, `listRequested(db, follower): string[]`, `resolveRequest(db, owner, requester, action): Promise<number>`, `applyPrivacyTransition(db, owner, to): Promise<void>`, `getFollowState(db, viewer, owner): Promise<"none" | "requested" | "following">`; `followUser` now returns `{ ok, error?, pending? }`.

- [ ] **Step 1: Write the failing e2e** — `e2e/api-privacy.spec.ts`

```ts
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");

type U = { api: APIRequestContext; handle: string };
const users: U[] = [];

async function newUser(label: string): Promise<U> {
  const api = await pwRequest.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { Origin: ORIGIN } });
  const email = `e2e-priv-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  const u = { api, handle: user.handle as string };
  users.push(u);
  return u;
}

async function setPrivacy(u: U, privacy: string) {
  const res = await u.api.put("/api/account/privacy", { data: { privacy } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

const follow = (from: U, to: U, action = "follow") =>
  from.api.post("/api/follows", { data: { handle: to.handle, action } });

const state = async (viewer: U, owner: U) =>
  (await (await viewer.api.get(`/api/follows?handle=${encodeURIComponent(owner.handle)}`)).json())
    .followState;

test.afterAll(async () => {
  await Promise.all(users.map((u) => u.api.dispose()));
});

test.describe("account privacy: follow requests", () => {
  test("private account: follow stays pending until approved", async () => {
    const [a, b] = [await newUser("a"), await newUser("b")];
    await setPrivacy(a, "private");

    const res = await (await follow(b, a)).json();
    expect(res).toMatchObject({ ok: true, following: false, requested: true });
    expect(await state(b, a)).toBe("requested");

    const reqs = await (await a.api.get("/api/follows/requests")).json();
    expect(reqs.requests.map((r: { handle: string }) => norm(r.handle))).toContain(norm(b.handle));

    expect((await follow(a, b, "approve")).ok()).toBeTruthy();
    expect(await state(b, a)).toBe("following");
  });

  test("locked account rejects new follows", async () => {
    const [a, b] = [await newUser("a"), await newUser("b")];
    await setPrivacy(a, "locked");
    const res = await follow(b, a);
    expect(res.status()).toBe(400);
  });

  test("switching to public approves pending requests", async () => {
    const [a, b] = [await newUser("a"), await newUser("b")];
    await setPrivacy(a, "private");
    await follow(b, a);
    expect(await state(b, a)).toBe("requested");
    await setPrivacy(a, "public");
    expect(await state(b, a)).toBe("following");
  });

  test("declining removes the request", async () => {
    const [a, b] = [await newUser("a"), await newUser("b")];
    await setPrivacy(a, "private");
    await follow(b, a);
    await follow(a, b, "decline");
    expect(await state(b, a)).toBe("none");
  });

  test("privacy endpoint rejects unknown values", async () => {
    const a = await newUser("a");
    const res = await a.api.put("/api/account/privacy", { data: { privacy: "secret" } });
    expect(res.status()).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (needs the test Mongo from `./e2e/start-test-mongo.sh`):
```
AUTH_SECRET=x CRON_SECRET=y MONGODB_URL="mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true" MONGODB_DB=aithoughts-e2e npx playwright test e2e/api-privacy.spec.ts
```
Expected: FAIL (`PUT /api/account/privacy` 404 / 405).

- [ ] **Step 3: Append the DB half to `src/lib/visibility.ts`**

```ts
import type { Db } from "mongodb";

const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");

export function handleVariants(h: string): string[] {
  const n = norm(h);
  return n ? Array.from(new Set([h, n, `@${n}`])) : [];
}

const APPROVED = { status: { $ne: "pending" } } as const;

export async function getPrivacy(db: Db, handle: string): Promise<Privacy> {
  const row = await db
    .collection("profiles")
    .findOne({ handle: { $in: handleVariants(handle) } }, { projection: { privacy: 1 } });
  return parsePrivacy(row?.privacy);
}

async function isApprovedFollower(db: Db, viewer: string, owner: string): Promise<boolean> {
  const n = await db.collection("follows").countDocuments(
    {
      follower: { $in: handleVariants(viewer) },
      following: { $in: handleVariants(owner) },
      ...APPROVED,
    },
    { limit: 1 }
  );
  return n > 0;
}

export async function getVisibility(
  db: Db,
  viewer: string | null,
  owner: string
): Promise<Visibility & { privacy: Privacy }> {
  const privacy = await getPrivacy(db, owner);
  const isSelf = !!viewer && norm(viewer) === norm(owner);
  const approved =
    privacy !== "public" && !isSelf && !!viewer && (await isApprovedFollower(db, viewer, owner));
  return { ...decideVisibility(privacy, { isSelf, isApprovedFollower: approved }), privacy };
}

export async function canViewPosts(db: Db, viewer: string | null, owner: string) {
  return (await getVisibility(db, viewer, owner)).posts;
}

/** True only when the post exists and this viewer may not see it. */
export async function postHiddenFrom(
  db: Db,
  viewer: string | null,
  postId: string
): Promise<boolean> {
  const { ObjectId } = await import("mongodb");
  let _id: InstanceType<typeof ObjectId>;
  try {
    _id = new ObjectId(postId);
  } catch {
    return false;
  }
  const post = await db.collection("posts").findOne({ _id }, { projection: { handle: 1 } });
  if (!post?.handle) return false;
  return !(await canViewPosts(db, viewer, String(post.handle)));
}

/**
 * Handles (all stored variants) of restricted authors this viewer may not see.
 * ponytail: $nin list, fine for hundreds of restricted accounts; denormalise
 * privacy onto posts or use $lookup if that grows.
 */
export async function hiddenHandles(
  db: Db,
  viewer: string | null,
  levels: Privacy[] = ["private", "locked"]
): Promise<string[]> {
  const restricted = await db
    .collection("profiles")
    .find({ privacy: { $in: levels } })
    .project({ handle: 1 })
    .toArray();
  if (!restricted.length) return [];
  const names = restricted.map((r) => norm(String(r.handle)));
  const visible = new Set<string>();
  if (viewer) {
    visible.add(norm(viewer));
    const rows = await db
      .collection("follows")
      .find({
        follower: { $in: handleVariants(viewer) },
        following: { $in: names.flatMap((h) => [h, `@${h}`]) },
        ...APPROVED,
      })
      .project({ following: 1 })
      .toArray();
    for (const r of rows) visible.add(norm(String(r.following)));
  }
  return names.filter((h) => !visible.has(h)).flatMap((h) => [h, `@${h}`]);
}

export async function hiddenAuthorFilter(db: Db, viewer: string | null) {
  const hidden = await hiddenHandles(db, viewer);
  return hidden.length ? { handle: { $nin: hidden } } : {};
}
```
Note: the `import type { Db }` line must sit at the top of the file; move it there. The unit test only imports the pure exports, and the `mongodb` type import is erased, so the test still runs.

- [ ] **Step 4: Update `src/lib/follows.ts`**

Add the imports and replace `followUser`, `listFollowing`, `listFollowers`; append the new helpers. Keep `unfollowUser` and `isFollowing` as-is (deleting a row also cancels a pending request).

```ts
import { followStatusFor, getPrivacy, pendingActionFor, type Privacy } from "./visibility";
```
(Relative import — `follows.ts` is not unit tested, but keep the style consistent with `visibility.ts`.)

`followUser` body after the self-follow guard:

```ts
  const existing = await db.collection("follows").findOne({
    follower: { $in: [a, follower, normHandle(follower)] },
    following: { $in: [b, following, normHandle(following)] },
  });
  if (existing) return { ok: true, pending: existing.status === "pending" };

  const status = followStatusFor(await getPrivacy(db, b));
  if (!status) return { ok: false, error: "This account isn't accepting followers" };

  await db.collection("follows").updateOne(
    { follower: a, following: b },
    {
      $set: { follower: a, following: b, updated_at: new Date() },
      $setOnInsert: { created_at: new Date(), status },
    },
    { upsert: true }
  );
  return { ok: true, pending: status === "pending" };
```
Change the return type to `Promise<{ ok: boolean; error?: string; pending?: boolean }>`.

In `listFollowing` and `listFollowers`, add `status: { $ne: "pending" },` inside the `.find({ ... })` filter object next to the `follower`/`following` key.

Append:

```ts
const variants = (h: string) => [withAt(h), h, normHandle(h)];

export async function listPendingRequests(db: Db, owner: string): Promise<string[]> {
  const rows = await db
    .collection("follows")
    .find({ following: { $in: variants(owner) }, status: "pending" })
    .limit(200)
    .toArray();
  return rows.map((r) => String(r.follower));
}

export async function listRequested(db: Db, follower: string): Promise<string[]> {
  const rows = await db
    .collection("follows")
    .find({ follower: { $in: variants(follower) }, status: "pending" })
    .limit(200)
    .toArray();
  return rows.map((r) => String(r.following));
}

export async function resolveRequest(
  db: Db,
  owner: string,
  requester: string,
  action: "approve" | "decline"
): Promise<number> {
  const filter = {
    follower: { $in: variants(requester) },
    following: { $in: variants(owner) },
    status: "pending",
  };
  if (action === "decline") return (await db.collection("follows").deleteMany(filter)).deletedCount;
  return (
    await db
      .collection("follows")
      .updateMany(filter, { $set: { status: "approved", updated_at: new Date() } })
  ).modifiedCount;
}

export async function applyPrivacyTransition(db: Db, owner: string, to: Privacy): Promise<void> {
  const action = pendingActionFor(to);
  if (action === "none") return;
  const filter = { following: { $in: variants(owner) }, status: "pending" };
  if (action === "decline") await db.collection("follows").deleteMany(filter);
  else
    await db
      .collection("follows")
      .updateMany(filter, { $set: { status: "approved", updated_at: new Date() } });
}

export async function getFollowState(
  db: Db,
  viewer: string,
  owner: string
): Promise<"none" | "requested" | "following"> {
  const row = await db.collection("follows").findOne({
    follower: { $in: variants(viewer) },
    following: { $in: variants(owner) },
  });
  if (!row) return "none";
  return row.status === "pending" ? "requested" : "following";
}

export async function resolveProfiles(db: Db, handles: string[]) {
  const unique = [...new Set(handles)];
  if (unique.length === 0) return [];
  const rows = await db.collection("profiles").find({ handle: { $in: unique } }).toArray();
  const byHandle = new Map(rows.map((r) => [String(r.handle), r]));
  return unique.map((handle) => {
    const row = byHandle.get(handle);
    return {
      handle,
      author: row?.author ?? handle.replace(/^@/, ""),
      avatarUrl: row?.avatar_url ?? row?.avatarUrl ?? "",
    };
  });
}
```

- [ ] **Step 5: Index** — in `src/lib/indexes.ts`, add to the `jobs` array after the `follows_pair_unique` entry:

```ts
    db.collection("profiles").createIndex(
      { privacy: 1 },
      { sparse: true, name: "profiles_privacy" }
    ),
```

- [ ] **Step 6: `src/app/api/follows/route.ts`**

Delete the local `resolveProfiles` and import it from `@/lib/follows` together with `applyPrivacyTransition`-free helpers: `followUser, getFollowState, listFollowers, listFollowing, resolveProfiles, resolveRequest, unfollowUser`; import `getVisibility` from `@/lib/visibility`.

Replace the body of `GET` after `const { db } = await connectToDatabase();` with:

```ts
    const viewer = session?.handle ?? null;
    const isSelf = !!viewer && normHandle(viewer) === normHandle(targetHandle);
    const followState = viewer && !isSelf ? await getFollowState(db, viewer, targetHandle) : undefined;
    const vis = await getVisibility(db, viewer, targetHandle);
    if (!vis.lists) {
      return NextResponse.json({
        following: [], followingProfiles: [], followers: [],
        restricted: true, followState, isFollowedByMe: false,
      });
    }
    const [following, followerHandles] = await Promise.all([
      listFollowing(db, targetHandle),
      listFollowers(db, targetHandle),
    ]);
    const [followingProfiles, followers] = await Promise.all([
      resolveProfiles(db, following),
      resolveProfiles(db, followerHandles),
    ]);
    return NextResponse.json({
      following, followingProfiles, followers, followState,
      isFollowedByMe: followState === "following",
    });
```

In `POST`, before the `unfollow` branch (after `const { db } = ...`) add:

```ts
    if (body.action === "approve" || body.action === "decline") {
      const resolved = await resolveRequest(db, session.handle, handle, body.action);
      return NextResponse.json({ ok: true, resolved });
    }
```
and replace the final follow response with:

```ts
    const result = await followUser(db, session.handle, handle);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, following: !result.pending, requested: !!result.pending });
```

- [ ] **Step 7: Create `src/app/api/follows/requests/route.ts`**

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { listPendingRequests, resolveProfiles } from "@/lib/follows";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const requests = await resolveProfiles(db, await listPendingRequests(db, session.handle));
    return NextResponse.json({ requests });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
```

- [ ] **Step 8: Create `src/app/api/account/privacy/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { applyPrivacyTransition, listPendingRequests } from "@/lib/follows";
import { getPrivacy, PRIVACY_LEVELS, type Privacy } from "@/lib/visibility";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const [privacy, pending] = await Promise.all([
      getPrivacy(db, session.handle),
      listPendingRequests(db, session.handle),
    ]);
    return NextResponse.json({ privacy, pending_count: pending.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await request.json();
    if (!PRIVACY_LEVELS.includes(body.privacy)) {
      return NextResponse.json({ error: "Invalid privacy setting" }, { status: 400 });
    }
    const privacy = body.privacy as Privacy;

    const { db } = await connectToDatabase();
    await db.collection("profiles").updateOne(
      { handle: session.handle },
      {
        $set: { handle: session.handle, privacy, updated_at: new Date() },
        $setOnInsert: { author: session.displayName },
      },
      { upsert: true }
    );
    await applyPrivacyTransition(db, session.handle, privacy);
    return NextResponse.json({ ok: true, privacy });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
```

- [ ] **Step 9: Verify**

Run: `npm test && npx tsc --noEmit && npx playwright test e2e/api-privacy.spec.ts` (same env as Step 2).
Expected: unit pass, tsc clean, 5 e2e tests pass.

---

### Task 3: Enforce on posts

**Files:**
- Modify: `src/app/api/posts/route.ts` (GET filter + quote hydration, POST quote guard)
- Modify: `src/app/api/posts/[id]/route.ts` (GET)
- Modify: `src/app/api/posts/[id]/messages/route.ts` (GET, POST)
- Modify: `src/app/api/posts/[id]/reactions/route.ts`
- Modify: `src/app/api/posts/[id]/view/route.ts`
- Modify: `src/app/api/posts/[id]/report/route.ts`
- Modify: `e2e/api-privacy.spec.ts` (append)

**Interfaces:** Consumes `hiddenAuthorFilter`, `hiddenHandles`, `getPrivacy`, `canViewPosts`, `postHiddenFrom`, `canBeReposted` from Task 1 and 2.

- [ ] **Step 1: Append failing tests** to `e2e/api-privacy.spec.ts`

```ts
async function post(u: U): Promise<string> {
  const res = await u.api.post("/api/posts", {
    data: { content: `e2e private probe ${Date.now()}`, media_type: "text" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).id as string;
}

test.describe("account privacy: posts", () => {
  test("stranger cannot read or interact with a private account's post", async () => {
    const [a, b] = [await newUser("a"), await newUser("b")];
    const id = await post(a);
    await setPrivacy(a, "private");

    const byHandle = await (await b.api.get(`/api/posts?handle=${encodeURIComponent(a.handle)}`)).json();
    expect(byHandle).toEqual([]);
    expect((await b.api.get(`/api/posts/${id}`)).status()).toBe(404);
    expect((await b.api.get(`/api/posts/${id}/messages`)).status()).toBe(404);
    expect(
      (await b.api.post(`/api/posts/${id}/messages`, { data: { body: "hello there" } })).status()
    ).toBe(404);
    expect((await b.api.post(`/api/posts/${id}/reactions`, { data: { reaction: "❤️" } })).status()).toBe(404);
    expect((await b.api.post(`/api/posts/${id}/view`)).status()).toBe(404);
    expect((await b.api.post(`/api/posts/${id}/report`, { data: { reason: "other" } })).status()).toBe(404);

    // The author still sees it.
    const own = await (await a.api.get(`/api/posts?handle=${encodeURIComponent(a.handle)}`)).json();
    expect(own.map((p: { id: string }) => p.id)).toContain(id);
  });

  test("approved follower gains access", async () => {
    const [a, b] = [await newUser("a"), await newUser("b")];
    const id = await post(a);
    await setPrivacy(a, "private");
    await follow(b, a);
    expect((await b.api.get(`/api/posts/${id}`)).status()).toBe(404);
    await follow(a, b, "approve");
    expect((await b.api.get(`/api/posts/${id}`)).status()).toBe(200);
  });

  test("private and locked takes cannot be quoted or reposted", async () => {
    const [a, b] = [await newUser("a"), await newUser("b")];
    const id = await post(a);
    await setPrivacy(a, "private");
    await follow(b, a);
    await follow(a, b, "approve");

    const quote = await b.api.post("/api/posts", {
      data: { content: "quoting this", media_type: "text", quoted_post_id: id },
    });
    expect(quote.status()).toBe(403);
    const repost = await b.api.post(`/api/posts/${id}/reactions`, { data: { reaction: "🔁" } });
    expect(repost.status()).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test e2e/api-privacy.spec.ts -g "account privacy: posts"` (same env). Expected: FAIL (stranger gets 200s).

- [ ] **Step 3: `posts/route.ts` GET**

Add import: `import { getPrivacy, hiddenAuthorFilter, hiddenHandles } from "@/lib/visibility";`

In `GET`, move `const session = await getSession();` to just after `const { db } = await connectToDatabase();` (delete the later declaration) and, right before `const posts = await db.collection<PostDoc>("posts").find(filter)`, add:

```ts
    const viewerHandle = session?.handle ?? null;
    const hiddenFilter = await hiddenAuthorFilter(db, viewerHandle);
    if (Object.keys(hiddenFilter).length) filter = { $and: [filter, hiddenFilter] };
```
`filter` is already `let filter: Record<string, unknown>`.

In the quoted-post hydration loop (`for (const q of quoted) {`), compute the hidden set once before the loop and skip hidden authors:

```ts
      const hiddenSet = new Set(
        (await hiddenHandles(db, viewerHandle)).map((h) => h.trim().toLowerCase().replace(/^@/, ""))
      );
      for (const q of quoted) {
        if (hiddenSet.has(normHandle(String(q.handle)))) continue;
```
(A skipped quote resolves to `null` in the response, which the client already renders as "removed"; Task 5 gives it the private wording.)

- [ ] **Step 4: `posts/route.ts` POST quote guard**

Right after the `quotedPostId` try/catch block, before `const doc: PostDoc = {`, add:

```ts
    if (quotedPostId) {
      const orig = await db
        .collection<PostDoc>("posts")
        .findOne({ _id: new ObjectId(quotedPostId) }, { projection: { handle: 1 } });
      if (orig && !canBeReposted(await getPrivacy(db, String(orig.handle)))) {
        return NextResponse.json({ error: "This take can't be quoted" }, { status: 403 });
      }
    }
```
Add `canBeReposted` to the visibility import.

- [ ] **Step 5: `posts/[id]/route.ts` GET**

Import `canViewPosts` from `@/lib/visibility`. After the `if (!post) return ... 404` line add:

```ts
    const viewer = await getSession();
    if (!(await canViewPosts(db, viewer?.handle ?? null, String(post.handle)))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
```
Then delete the later `const session = await getSession();` line and rename its uses to `viewer` (the only use is `session?.handle` in the `me` computation).

- [ ] **Step 6: `messages/route.ts`**

Imports: `import { canViewPosts, postHiddenFrom } from "@/lib/visibility";`

GET: after `const { db } = await connectToDatabase();` add:

```ts
    const viewer = await getSession();
    if (await postHiddenFrom(db, viewer?.handle ?? null, id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
```
POST: after `if (!post) return ... 404` add:

```ts
    if (!(await canViewPosts(db, session.handle, String(post.handle)))) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
```

- [ ] **Step 7: `reactions/route.ts`**

Imports: `import { BOOST_REACTION, shouldNotifyOwner } from "@/lib/likes";` (merge into the existing likes import) and `import { canBeReposted, canViewPosts, getPrivacy } from "@/lib/visibility";`. After `if (!post) return ... 404` add:

```ts
    if (!(await canViewPosts(db, session.handle, String(post.handle)))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (reaction === BOOST_REACTION && !canBeReposted(await getPrivacy(db, String(post.handle)))) {
      return NextResponse.json({ error: "This take can't be reposted" }, { status: 403 });
    }
```

- [ ] **Step 8: `view/route.ts`** — import `canViewPosts`; change the post lookup projection to `{ handle: 1 }` and after the 404 line add:

```ts
    if (!(await canViewPosts(db, session?.handle ?? null, String(post.handle)))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
```

- [ ] **Step 9: `report/route.ts`** — import `postHiddenFrom`; after `const { db } = await connectToDatabase();` add:

```ts
    if (await postHiddenFrom(db, session.handle, id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
```

- [ ] **Step 10: Verify**

Run: `npx tsc --noEmit && npx playwright test e2e/api-privacy.spec.ts`
Expected: tsc clean, all 8 tests pass.

---

### Task 4: Enforce on profile, search, peers, digest, notifications

**Files:**
- Modify: `src/app/api/profile/route.ts` (GET)
- Modify: `src/app/api/people/route.ts`
- Modify: `src/app/api/prompt/peers/route.ts`
- Modify: `src/app/api/cron/weekly-voices/route.ts`
- Modify: `src/lib/activity.ts` (`notifyMentions`)
- Modify: `e2e/api-privacy.spec.ts` (append)

- [ ] **Step 1: Append failing tests**

```ts
test.describe("account privacy: identity and discovery", () => {
  test("profile and search visibility per level", async () => {
    const [a, b] = [await newUser("a"), await newUser("b")];
    const profile = async () =>
      (await (await b.api.get(`/api/profile?handle=${encodeURIComponent(a.handle)}`)).json()).profile;
    const searchable = async () => {
      const q = norm(a.handle);
      const { people } = await (await b.api.get(`/api/people?q=${encodeURIComponent(q)}`)).json();
      return people.some((p: { handle: string }) => norm(p.handle) === q);
    };

    await setPrivacy(a, "private");
    expect(await profile()).toMatchObject({ privacy: "private", restricted: true });
    expect(await searchable()).toBe(true);

    await setPrivacy(a, "locked");
    expect(await profile()).toBeNull();
    expect(await searchable()).toBe(false);

    // Follower lists stay hidden from a stranger.
    const graph = await (await b.api.get(`/api/follows?handle=${encodeURIComponent(a.handle)}`)).json();
    expect(graph).toMatchObject({ restricted: true, followers: [] });
  });

  test("prompt peers never surface a private account's take", async () => {
    const [a, b] = [await newUser("a"), await newUser("b")];
    const day = new Date().toISOString().slice(0, 10);
    const res = await a.api.post("/api/posts", {
      data: { content: `peers probe ${Date.now()}`, media_type: "text", prompt_day: day, from_daily_prompt: true },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    await setPrivacy(a, "private");
    const { peers } = await (await b.api.get(`/api/prompt/peers?day=${day}`)).json();
    expect(peers.map((p: { handle: string }) => norm(p.handle))).not.toContain(norm(a.handle));
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx playwright test e2e/api-privacy.spec.ts -g "identity and discovery"`. Expected: FAIL.

- [ ] **Step 3: `profile/route.ts` GET** — import `getSession` (already imported) and `getVisibility`; replace the `GET` body after `if (!handle) ...` with:

```ts
    const { db } = await connectToDatabase();
    const session = await getSession();
    const vis = await getVisibility(db, session?.handle ?? null, handle);
    if (!vis.profile) return NextResponse.json({ profile: null });
    const profile = await db.collection("profiles").findOne({ handle });
    return NextResponse.json({
      profile: profile
        ? {
            handle: profile.handle,
            author: profile.author,
            bio: profile.bio ?? "",
            avatarUrl: profile.avatar_url ?? profile.avatarUrl ?? "",
            privacy: vis.privacy,
            restricted: !vis.posts,
          }
        : null,
    });
```

- [ ] **Step 4: `people/route.ts`**

Imports: `import { listFollowing, listRequested } from "@/lib/follows";` and `import { hiddenHandles } from "@/lib/visibility";`. Replace the `followingSet` block with:

```ts
    const viewer = session?.handle ?? null;
    const [followingList, requestedList, lockedHidden] = await Promise.all([
      viewer ? listFollowing(db, viewer) : [],
      viewer ? listRequested(db, viewer) : [],
      hiddenHandles(db, viewer, ["locked"]),
    ]);
    const followingSet = new Set(followingList.map((h) => norm(h)));
    const requestedSet = new Set(requestedList.map((h) => norm(h)));
    const lockedSet = new Set(lockedHidden.map((h) => norm(h)));
```
Add `requested: boolean;` to `PersonRow`. In `pushPerson`, change the guard to `if (!key || (me && key === me) || seen.has(key) || lockedSet.has(key)) return;` and add `requested: requestedSet.has(key),` to the pushed object.

- [ ] **Step 5: `prompt/peers/route.ts`** — import `hiddenAuthorFilter`; in the peers branch replace `.find({ prompt_day: day })` with:

```ts
      .find({ prompt_day: day, ...(await hiddenAuthorFilter(db, session?.handle ?? null)) })
```
(`catchup` mode is safe: `listFollowing` is now approved-only.)

- [ ] **Step 6: `weekly-voices/route.ts`** — import `hiddenAuthorFilter`; replace `.find({ created_at: { $gte: weekAgo } })` with:

```ts
      .find({ created_at: { $gte: weekAgo }, ...(await hiddenAuthorFilter(db, null)) })
```

- [ ] **Step 7: `activity.ts` `notifyMentions`** — add `import { canViewPosts, getPrivacy } from "@/lib/visibility";`. After the `threadHandles`/`skip` setup and before the `for (const raw of opts.mentioned)` loop add:

```ts
  const restricted = (await getPrivacy(db, String(post.handle))) !== "public";
```
Inside the loop, immediately after `if (!allowed) continue;` add:

```ts
    if (restricted && !(await canViewPosts(db, `@${key}`, String(post.handle)))) continue;
```

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint && npx playwright test e2e/api-privacy.spec.ts`
Expected: everything passes (10 e2e tests in this file).

---

### Task 5: Account Center UI

**Files:**
- Modify: `src/lib/db.ts` (`ProfileInfo`, `FollowGraph`)
- Create: `src/components/AccountCenter.tsx`
- Modify: `src/components/ProfileView.tsx`
- Modify: `src/app/app/page.tsx` (`onFeelWith`)

- [ ] **Step 1: Types in `src/lib/db.ts`** — add to `ProfileInfo`: `privacy?: "public" | "private" | "locked"; restricted?: boolean;`. Add to `FollowGraph`: `followState?: "none" | "requested" | "following"; restricted?: boolean;`.

- [ ] **Step 2: Create `src/components/AccountCenter.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Lock, Globe, ShieldCheck, X } from "lucide-react";

type Privacy = "public" | "private" | "locked";
type Request = { handle: string; author: string; avatarUrl: string };

const OPTIONS: { id: Privacy; label: string; icon: typeof Globe; blurb: string }[] = [
  { id: "public", label: "Public", icon: Globe, blurb: "Anyone can see your takes and follow you." },
  {
    id: "private",
    label: "Private",
    icon: Lock,
    blurb: "People can find you, but only followers you approve see your takes.",
  },
  {
    id: "locked",
    label: "Locked",
    icon: ShieldCheck,
    blurb:
      "Hidden from search and profile. Current followers keep access; nobody new can follow.",
  },
];

const json = { "Content-Type": "application/json" };

export default function AccountCenter({ onBack }: { onBack: () => void }) {
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        fetch("/api/account/privacy", { credentials: "include", cache: "no-store" }),
        fetch("/api/follows/requests", { credentials: "include", cache: "no-store" }),
      ]);
      if (p.ok) setPrivacy((await p.json()).privacy);
      if (r.ok) setRequests((await r.json()).requests ?? []);
    } catch {
      setError("Couldn’t load your settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (next: Privacy) => {
    if (next === privacy || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/privacy", {
        method: "PUT",
        credentials: "include",
        headers: json,
        body: JSON.stringify({ privacy: next }),
      });
      if (!res.ok) throw new Error();
      setPrivacy(next);
      await load();
    } catch {
      setError("Couldn’t change that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (handle: string, action: "approve" | "decline") => {
    setRequests((rs) => rs.filter((r) => r.handle !== handle));
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        credentials: "include",
        headers: json,
        body: JSON.stringify({ handle, action }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("Couldn’t update that request.");
      await load();
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="text-lg font-semibold text-[var(--foreground)]">Account Center</h2>

      <section className="mt-4 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Who can see your takes
        </p>
        <div className="mt-3 space-y-2" role="radiogroup" aria-label="Account privacy">
          {OPTIONS.map(({ id, label, icon: Icon, blurb }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={privacy === id}
              disabled={busy || privacy === null}
              onClick={() => void choose(id)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                privacy === id
                  ? "border-[var(--accent)] bg-[var(--surface-2)]"
                  : "border-[var(--border-base)] hover:border-[var(--accent)]"
              }`}
            >
              <Icon className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-[var(--foreground)]">{label}</span>
                <span className="block text-xs leading-relaxed text-[var(--muted)]">{blurb}</span>
              </span>
              {privacy === id && <Check className="h-4 w-4 text-[var(--accent)]" />}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
      </section>

      {requests.length > 0 && (
        <section className="mt-4 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Follow requests ({requests.length})
          </p>
          <ul className="mt-3 divide-y divide-[var(--border-base)]">
            {requests.map((r) => (
              <li key={r.handle} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                    {r.author}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">{r.handle}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label={`Approve ${r.handle}`}
                    onClick={() => void resolve(r.handle, "approve")}
                    className="rounded-full bg-[var(--accent)] p-2 text-[var(--surface)] hover:bg-[var(--accent-2)]"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Decline ${r.handle}`}
                    onClick={() => void resolve(r.handle, "decline")}
                    className="rounded-full border border-[var(--border-base)] p-2 text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `ProfileView.tsx`**

Import: add `Lock, Settings` to the lucide import list, and `import AccountCenter from "@/components/AccountCenter";`.

Add state next to `deletingAccount`: `const [showAccount, setShowAccount] = useState(false);`.

At the very start of the component's `return (` (own profile only), short-circuit:

```tsx
  if (isOwn && showAccount) return <AccountCenter onBack={() => setShowAccount(false)} />;
```
(Place it after all hooks so hook order is unchanged.)

Add an "Account Center" row immediately before the "Get the app" block (`{isOwn && (` at the "Get the app" card):

```tsx
      {isOwn && user && (
        <button
          type="button"
          onClick={() => setShowAccount(true)}
          className="mt-6 flex w-full items-center justify-between rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <Settings className="h-4 w-4 text-[var(--accent)]" /> Account Center
          </span>
          <span className="text-xs text-[var(--muted)]">Privacy and requests</span>
        </button>
      )}
```

Follow button: replace `const isFollowingViewed = Boolean(viewedFollow?.isFollowedByMe);` with

```tsx
  const followState = viewedFollow?.followState ?? (viewedFollow?.isFollowedByMe ? "following" : "none");
  const isFollowingViewed = followState === "following";
  const isRequested = followState === "requested";
```
In `toggleFollow`, change `const next = !isFollowingViewed;` to `const next = !(isFollowingViewed || isRequested);` and delete the optimistic `setViewedFollow((prev) => ...)` line (the refetch below it sets the truth). In the button, treat requested like following for styling and show a label:

```tsx
                      isFollowingViewed || isRequested
```
in the `className` ternary, and replace the inner ternary with three cases: `isFollowingViewed` → "Following", `isRequested` → `<><UserCheck className="h-3.5 w-3.5" /> Requested</>`, else Follow.

Private panel: immediately after the connection-lists block (`: viewedFollow && (...)` ternary closing), add:

```tsx
      {!isOwn && viewedFollow?.restricted && (
        <div className="mt-6 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-6 text-center">
          <Lock className="mx-auto h-5 w-5 text-[var(--muted)]" />
          <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
            This account is private
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Follow to request access to their takes.
          </p>
        </div>
      )}
```

- [ ] **Step 4: `app/page.tsx` `onFeelWith`** — a pending request must not appear as "following". Replace `if (!res.ok) setFollowing(prev);` with:

```tsx
        if (!res.ok) setFollowing(prev);
        else if (next && (await res.json()).requested) setFollowing(prev);
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Then run the app (`npm run dev`), sign in, open **You → Account Center**, switch to Private, and confirm the option highlights and persists on reload; view another account that is private and confirm the "Requested" button and the private panel. Report what was and wasn't checked in the browser.

---

### Task 6: Full regression

- [ ] **Step 1:** `npm run lint && npm test && npx tsc --noEmit`
- [ ] **Step 2:** Full e2e in CI mode: `CI=1 AUTH_SECRET=ci-e2e-secret-not-for-prod CRON_SECRET=ci-e2e-cron-secret MONGODB_URL="mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true" MONGODB_DB=aithoughts-e2e npm run test:e2e`
  Expected: all pre-existing 12 tests plus the new privacy tests pass.
- [ ] **Step 3:** `npm run build` (CI runs it; `tsc` alone doesn't generate `.next/types`).

---

## Self-review against the spec

- Behaviour table → Task 1 (`decideVisibility`, `followStatusFor`, `canBeReposted`), enforced in Tasks 3 and 4.
- Transitions → `pendingActionFor` + `applyPrivacyTransition` (Task 1/2), tested by "switching to public approves pending requests" and the decline test; locked-decline path is unit-tested only, at the decision level.
- Data model → Task 2 (privacy on `profiles`, `status` on `follows`, `$ne: "pending"` everywhere).
- `hiddenAuthorFilter` with its own uncapped follows query → Task 2 Step 3 (`hiddenHandles`).
- Enforcement table rows: feed/quotes/`[id]`/messages/reactions/view/report/quote guard → Task 3; profile/follows/people/peers/digest/notifyMentions → Tasks 2 and 4; `notifyFollowersOfPost` needs no edit (approved-only `listFollowers`); `deleteUserAccount` already deletes profiles and follows (verified, no task).
- Repost of a private take when the repost row is removed: allowed to un-repost only if still viewable. Known edge, not handled.
- UI → Task 5.

## Deviations recorded during execution

- `PUT /api/account/privacy` has no dedicated rate limiter (spec updated): the shared-cast e2e legitimately exceeded 20 changes / 10 min, and the proxy already caps mutating `/api` calls per IP.
- `e2e/api-privacy.spec.ts` uses one shared cast (A, B, C) signed in once, each with its own `X-Forwarded-For`, instead of new accounts per test: sign-in is capped at 8/IP/15 min and 40 globally/hour, and a new account may post once in its first hour. A's single post carries today's prompt day so it also serves the peers test.
- Added a mention-notification test (with a public-thread control) beyond the plan; mutation-checked against `notifyMentions`.
