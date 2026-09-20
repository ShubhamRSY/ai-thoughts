# Account blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mutual-invisibility blocking: a user can block another; neither sees the other, and the blocked user can't follow, reply, react, quote or mention the blocker.

**Architecture:** A `blocks` collection and `src/lib/blocks.ts`. `getVisibility` and `hiddenHandles` in `src/lib/visibility.ts` treat a block as another reason a viewer can't see someone, so most routes inherit it. A handful of write/notification paths get explicit checks.

**Tech Stack:** Next.js, MongoDB driver, Playwright request contexts (API e2e) and a browser spec (UI).

**Spec:** `docs/superpowers/specs/2026-09-18-account-blocking-design.md`

## Global Constraints

- No commits or pushes unless the user asks; each task ends at a verification checkpoint.
- Block rows store handles normalised as `@lowercase`; queries against `follows`/`notifications`/`users` still use `{ $in: variants }` because those store mixed forms.
- `blocks.ts` must not import `visibility.ts` (visibility imports blocks).
- A blocked user must never see a signal that a block exists: same error as a locked account, profile `null`, takes 404. Only the blocker gets `blockedByMe`.
- API e2e requests send an `Origin` header and a distinct `X-Forwarded-For` (sign-in is capped at 8/IP/15 min, 40 globally/hour; a new account may post once in its first hour).
- Moderator routes are unchanged.

## File map

| File | Responsibility |
|---|---|
| `src/lib/blocks.ts` (new) | Block persistence and queries |
| `src/lib/visibility.ts` | Blocks feed into `getVisibility` / `hiddenHandles` |
| `src/lib/follows.ts`, `src/lib/activity.ts` | Reject follows, suppress notifications |
| `src/app/api/blocks/route.ts` (new) | `GET` list, `POST` block/unblock |
| `src/app/api/follows/route.ts`, `posts/route.ts`, `posts/[id]/route.ts`, `posts/[id]/messages/route.ts` | Extra enforcement |
| `src/lib/indexes.ts` | Indexes |
| `e2e/api-blocking.spec.ts` (new), `e2e/account-center.spec.ts` | Tests |
| `src/components/AccountCenter.tsx`, `ProfileView.tsx`, `src/lib/db.ts` | UI |

---

### Task 1: Core: blocks module, visibility integration, endpoint

**Files:** create `src/lib/blocks.ts`, `src/app/api/blocks/route.ts`, `e2e/api-blocking.spec.ts`; modify `src/lib/visibility.ts`, `src/lib/indexes.ts`.

**Interfaces (produces):** `isBlockedPair(db, a, b): Promise<boolean>`; `blockedHandles(db, viewer: string | null): Promise<string[]>` (all variants, both directions, `[]` for null); `blockedByMe(db, viewer, other): Promise<boolean>`; `blockUser(db, blocker, target): Promise<{ ok: boolean; error?: string; status?: number }>`; `unblockUser(db, blocker, target): Promise<void>`; `listBlocked(db, blocker): Promise<string[]>`.

- [ ] **Step 1: Write the failing e2e** `e2e/api-blocking.spec.ts` (shared cast A/B/C, `beforeAll` signs in three users, A/B/C each create their one post; `beforeEach` unblocks both directions and removes follows both ways). Initial tests:
  - block clears follows both ways and hides content both ways (A/B follow each other, A blocks B; `GET /api/posts/:id` 404 in both directions; `GET /api/profile` `null` both ways; each absent from the other's `/api/people?q=`);
  - `POST /api/blocks` validation: self 400, unknown handle 404, double block ok, `GET /api/blocks` lists B, unblock removes it;
  - unblock restores visibility but not follows.
- [ ] **Step 2:** run it; expect failures (404 on `/api/blocks`).
- [ ] **Step 3: `src/lib/blocks.ts`**

```ts
import type { Db } from "mongodb";

const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const at = (h: string) => `@${norm(h)}`;
const variants = (h: string) => {
  const n = norm(h);
  return n ? Array.from(new Set([h, n, `@${n}`])) : [];
};

export async function isBlockedPair(db: Db, a: string, b: string): Promise<boolean> {
  const n = await db.collection("blocks").countDocuments(
    { $or: [{ blocker: at(a), blocked: at(b) }, { blocker: at(b), blocked: at(a) }] },
    { limit: 1 }
  );
  return n > 0;
}

/** Everyone in a block relationship with `viewer`, either direction. */
export async function blockedHandles(db: Db, viewer: string | null): Promise<string[]> {
  if (!viewer) return [];
  const me = at(viewer);
  const rows = await db
    .collection("blocks")
    .find({ $or: [{ blocker: me }, { blocked: me }] })
    .project({ blocker: 1, blocked: 1 })
    .toArray();
  const others = new Set(rows.map((r) => norm(String(r.blocker === me ? r.blocked : r.blocker))));
  return [...others].flatMap((h) => [h, `@${h}`]);
}

/** One direction only: the sole signal a client ever gets, and only the blocker. */
export async function blockedByMe(db: Db, viewer: string, other: string): Promise<boolean> {
  return (
    (await db.collection("blocks").countDocuments({ blocker: at(viewer), blocked: at(other) }, { limit: 1 })) > 0
  );
}

export async function blockUser(
  db: Db,
  blocker: string,
  target: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const a = at(blocker);
  const b = at(target);
  if (!norm(target)) return { ok: false, error: "Invalid handle", status: 400 };
  if (a === b) return { ok: false, error: "Can't block yourself", status: 400 };
  const exists = await db
    .collection("users")
    .findOne({ handle: { $in: [norm(target), b] } }, { projection: { _id: 1 } });
  if (!exists) return { ok: false, error: "Not found", status: 404 };

  await db
    .collection("blocks")
    .updateOne({ blocker: a, blocked: b }, { $setOnInsert: { created_at: new Date() } }, { upsert: true });

  const va = variants(a);
  const vb = variants(b);
  await db.collection("follows").deleteMany({
    $or: [
      { follower: { $in: va }, following: { $in: vb } },
      { follower: { $in: vb }, following: { $in: va } },
    ],
  });
  await db.collection("notifications").deleteMany({
    $or: [
      { recipient_handle: { $in: va }, actor_handle: { $in: vb } },
      { recipient_handle: { $in: vb }, actor_handle: { $in: va } },
    ],
  });
  return { ok: true };
}

export async function unblockUser(db: Db, blocker: string, target: string): Promise<void> {
  await db.collection("blocks").deleteMany({ blocker: at(blocker), blocked: at(target) });
}

export async function listBlocked(db: Db, blocker: string): Promise<string[]> {
  const rows = await db
    .collection("blocks")
    .find({ blocker: at(blocker) })
    .sort({ created_at: -1 })
    .limit(500)
    .toArray();
  return rows.map((r) => String(r.blocked));
}
```

- [ ] **Step 4: `src/app/api/blocks/route.ts`**: `GET` returns `{ blocked: await resolveProfiles(db, await listBlocked(...)) }`; `POST` reads `{ handle, action }`, 400 unless `action` is `"block"`/`"unblock"` and `handle` is a non-empty string, `block` maps `blockUser`'s `status`/`error`, `unblock` calls `unblockUser`; 401 when signed out; standard try/catch 500.
- [ ] **Step 5: `visibility.ts`**: import `{ blockedHandles, isBlockedPair } from "./blocks"`.
  - In `getVisibility`, after `isSelf`: `if (viewer && !isSelf && (await isBlockedPair(db, viewer, owner))) return { posts: false, profile: false, lists: false, searchable: false, privacy };`
  - In `hiddenHandles`: compute `const blocked = await blockedHandles(db, viewer);` first; change `if (!restricted.length) return [];` to `if (!restricted.length) return blocked;`; make the final return `[...blocked, ...names.filter((h) => !visible.has(h)).flatMap((h) => [h, `@${h}`])]`.
- [ ] **Step 6: `indexes.ts`**: add `blocks_pair_unique` (`{ blocker: 1, blocked: 1 }`, unique) and `blocks_blocked` (`{ blocked: 1 }`).
- [ ] **Step 7: Verify:** `npx tsc --noEmit && npx playwright test e2e/api-blocking.spec.ts` (test Mongo running; env as for `api-privacy.spec.ts`). Expected: pass.

### Task 2: Explicit enforcement

**Files:** modify `src/lib/follows.ts`, `src/lib/activity.ts`, `src/app/api/posts/route.ts`, `src/app/api/posts/[id]/route.ts`, `src/app/api/posts/[id]/messages/route.ts`, `src/app/api/follows/route.ts`; append to `e2e/api-blocking.spec.ts`.

- [ ] **Step 1: Append failing tests:** (a) follow attempts either way return 400 with the locked-account message; (b) B's reply on C's take is visible to A before the block (control), hidden from A afterwards, still visible to C; (c) mention control: B mentions A in a reply on C's take, A has a `mention` for that post; after A blocks B the count is 0 and a new B mention keeps it 0; (d) "liked by": B likes C's take, A sees B in `liked_by` before the block (control) and not after, `GET /api/follows?handle=B` from A has `blockedByMe: true` and from B `blockedByMe` is falsy; (e) B can't quote A's public take once blocked (403).
- [ ] **Step 2:** run; expect failures.
- [ ] **Step 3: `follows.ts` `followUser`:** import `isBlockedPair`; after the self-follow guard add `if (await isBlockedPair(db, a, b)) return { ok: false, error: "This account isn't accepting followers" };`.
- [ ] **Step 4: `activity.ts` `writeActivity`:** import `isBlockedPair`; after the self-recipient early return add `if (await isBlockedPair(db, opts.recipientHandle, opts.actorHandle)) return;`.
- [ ] **Step 5: `messages/route.ts` GET:** import `blockedHandles`; after the `postHiddenFrom` check compute `const blocked = new Set((await blockedHandles(db, viewer?.handle ?? null)).map(normHandle));` and drop `messages` rows whose `normHandle(String(m.handle ?? ""))` is in it before mapping.
- [ ] **Step 6: liked-by:** in `posts/route.ts` compute `blockedSet` from `blockedHandles(db, viewerHandle)` (normalised) before `posts.map`, and pass `heartRows.filter((r) => !blockedSet.has(normHandle(String(r.handle ?? ""))))` to `buildLikedBy` (counts and `liked_by_me` keep using the unfiltered rows). Same in `posts/[id]/route.ts` with `viewer?.handle ?? null`.
- [ ] **Step 7: quote guard (`posts/route.ts` POST):** import `canViewPosts`; reject when `!canBeReposted(...) || !(await canViewPosts(db, session.handle, String(orig.handle)))`.
- [ ] **Step 8: `follows/route.ts` GET:** import `blockedByMe`; compute `const iBlocked = viewer && !isSelf ? await blockedByMe(db, viewer, targetHandle) : false;` and add `blockedByMe: iBlocked || undefined` to both the restricted and normal JSON responses.
- [ ] **Step 9: Verify:** `npx tsc --noEmit && npx playwright test e2e/api-blocking.spec.ts e2e/api-privacy.spec.ts`. Mutation-check one guard (disable `writeActivity`'s block check; the mention test must fail), then restore.

### Task 3: UI and regression

**Files:** modify `src/lib/db.ts` (add `blockedByMe?: boolean` to `FollowGraph`), `src/components/AccountCenter.tsx`, `src/components/ProfileView.tsx`, `e2e/account-center.spec.ts`.

- [ ] **Step 1: Failing UI test** (append to `account-center.spec.ts`): sign in as owner, second user X via API; owner opens X's profile through `/app` (e.g. via the tagged/people route used by the app), clicks **Block**, accepts the confirm dialog, then opens Account Center → "Blocked accounts" shows X, clicks Unblock (waiting on the POST response); asserts `GET /api/blocks` is empty.
- [ ] **Step 2: `AccountCenter.tsx`:** add a "Blocked accounts" section loaded from `GET /api/blocks`, one row per user with an **Unblock** button (`POST /api/blocks` `{ handle, action: "unblock" }`, optimistic removal, reload on failure); render only when the list is non-empty.
- [ ] **Step 3: `ProfileView.tsx`:** on another user's profile, add a **Block** button (`window.confirm`, then `POST /api/blocks` `{ handle, action: "block" }`, then `onBack?.()`); when `viewedFollow?.blockedByMe`, show "You blocked this account" with **Unblock** and hide Follow.
- [ ] **Step 3: Verify:** `npx tsc --noEmit && npm run lint && npm test`, then the full suite in CI mode (`CI=1 ... npm run test:e2e`) and `npm run build`.

## Deviations recorded during execution

- `visibility.ts` imports `./blocks.ts` (with the extension): `npm test` runs `visibility.test.ts` under `--experimental-strip-types`, which can't resolve an extensionless relative import. `tsconfig` already allows it.
- `posts/[id]/route.ts` names the session `session`, not `viewer`; the liked-by filter uses that.
- The quote test uses a fourth account (`D`) with no post: the first-hour post cap is checked before the quote guard, and `B` had already used its one post.
- `e2e/api-blocking.spec.ts` creates a `profiles` row for each cast member (via `PUT /api/account/privacy`); without one `GET /api/profile` is `null` regardless of blocks and the "profile hidden" assertions would pass vacuously.
- Browser tests call `POST /api/prefs { onboarded: true }` after sign-in: a first-run `OnboardingWizard` (another in-progress change) now covers `/app` for new accounts.
- Fixed a gap from the privacy slice: `PeopleSearchView` ignored `requested` and optimistically showed "Following" for private accounts. It now shows "Requested" and refreshes from the server after a follow.
