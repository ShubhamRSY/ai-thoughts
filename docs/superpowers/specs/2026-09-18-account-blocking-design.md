# Account blocking — design

Slice 2 of the Account Center. Builds on the privacy slice
(`2026-09-18-account-privacy-design.md`), whose `src/lib/visibility.ts` is the
single place that decides who can see whom.

## Goal

A user can block another user. Blocking is **mutual invisibility**: neither side
sees the other's profile, takes, replies or search results, and the blocked user
can't follow, reply, react, quote or mention the blocker. The blocked user is
never told.

## Non-goals

- Mute (a lighter, one-way hide). Not requested.
- Reporting a blocked user's take *after* blocking: their takes 404 for the
  blocker, so report first, then block.
- A cap on block-list size.
- Removing the blocked user's past likes and reposts from the blocker's takes;
  counts are left alone (only "liked by" *names* are hidden).
- Moderator lockout: `/admin`, `/keeper`, `/owner` read the DB directly and are
  unchanged.

## Data model

`blocks` collection: `{ blocker: "@x", blocked: "@y", created_at }`, handles
stored normalised as `@lowercase` (as `follows` does). Unique index
`blocks_pair_unique` on `{ blocker: 1, blocked: 1 }`, plus `{ blocked: 1 }` so
"who blocked me" is indexed.

## Core module: `src/lib/blocks.ts`

- `isBlockedPair(db, a, b): Promise<boolean>` — a block exists in either
  direction.
- `blockedHandles(db, viewer): Promise<string[]>` — every handle (all stored
  variants) in a block relationship with `viewer`, both directions.
- `blockedByMe(db, viewer, other): Promise<boolean>` — one direction only; the
  sole signal ever returned to a client, and only to the blocker.
- `blockUser(db, blocker, target)`: creates the row (idempotent), deletes follows
  in both directions (any status, so pending requests too), deletes
  notifications between the two in both directions. Rejects self-blocks and
  handles with no `users` row.
- `unblockUser(db, blocker, target)`: deletes the row. Follows are **not**
  restored.
- `listBlocked(db, blocker)`: handles blocked by `blocker`.

## Integration with visibility (most of the work is free)

- `getVisibility(db, viewer, owner)`: if `viewer` is not the owner and
  `isBlockedPair`, every flag (`posts`, `profile`, `lists`, `searchable`) is
  `false`. `canViewPosts` and `postHiddenFrom` inherit this.
- `hiddenHandles(db, viewer, levels)`: **always** adds `blockedHandles(db,
  viewer)` in addition to the privacy-restricted authors for `levels`. So
  `hiddenAuthorFilter` (feed, `?handle=`, `?tagged=`, `prompt/peers`) and the
  locked-only call in people search exclude blocked users automatically.
  `hiddenAuthorFilter(db, null)` (weekly digest) has no viewer, so no blocks.

These give blocking, with no route edits, on: feed, `?handle=`, `?tagged=`,
`prompt/peers`, `GET /api/posts/[id]`, reactions, views, reports, message
posting, profile, follower/following lists, people search, and quoted-post
hydration.

To the blocked user a blocker looks like a **locked account**: profile
`null`, follows rejected, takes 404. Follower-list requests for a blocked pair
return `restricted: true`, identical to private.

## Explicit changes beyond visibility

| Where | Change |
|---|---|
| `followUser` | reject if `isBlockedPair`, with the *same* error as a locked account ("This account isn't accepting followers") so a block isn't revealed |
| `GET /api/posts/[id]/messages` | drop replies whose handle is in `blockedHandles(viewer)` (covers the blocked user's replies on third-party threads) |
| "Liked by" names, feed and `[id]` | omit reactions from `blockedHandles(viewer)` when building the names list; counts unchanged |
| `writeActivity` (`src/lib/activity.ts`) | return early if actor and recipient are a blocked pair. This is the single sink for notifications and push, so it covers reply, reaction, mention and follow-post notifications |
| `POST /api/posts` quote guard | also reject (403) when `canViewPosts` is false for the original's author, so a block also stops quoting a public take |
| `GET /api/follows` | add `blockedByMe: true` when the viewer blocked the target (never sent to the blocked side) |

## API

- `GET /api/blocks` → `{ blocked: [{ handle, author, avatarUrl }] }` (reuses
  `resolveProfiles`).
- `POST /api/blocks` with `{ handle, action: "block" | "unblock" }` (matches the
  style of `POST /api/follows`). 401 signed out, 400 on bad handle or self,
  404 for an unknown handle. No dedicated rate limiter, same reasoning as the
  privacy endpoint (proxy already caps mutating `/api` calls per IP).

## UI

- **Profile of another user:** a Block action next to Follow (confirm prompt).
  When `blockedByMe`, show "You blocked this account" with Unblock and hide
  Follow. Their profile is otherwise hidden from you, so this is only reachable
  via the Account Center list or a stale link.
- **Account Center:** a "Blocked accounts" section listing blocked users with
  Unblock. This is the reliable way back to a blocked profile.
- After blocking from a profile, return the user to where they came from.

## Testing

- **E2E** (`e2e/api-blocking.spec.ts`, shared A/B/C cast with distinct
  `X-Forwarded-For` and an `Origin` header, same reasoning as
  `api-privacy.spec.ts`; A's and B's single allowed first-hour post are reused):
  - A blocks B: any follow either way is gone; B gets 404 on A's take; A's
    `?handle=` feed for B is empty and B is missing from A's search and vice
    versa; B's follow attempt is rejected with the locked-account message.
  - B's reply on C's take is absent from A's reply list but present for C.
  - Positive control then guard: with no block, B mentioning A produces a
    mention notification for A; after A blocks B, a new mention does not.
  - "Liked by": B likes C's take; A's view of it omits B's name, count intact.
  - Unblock restores visibility; follows are not restored.
  - Blocking yourself → 400; unknown handle → 404; blocking twice is a no-op.
- **UI** (`e2e/account-center.spec.ts` addition): block from another user's
  profile, see it in Blocked accounts, unblock.

## Risks

- Coverage still depends on routes going through `getVisibility` /
  `hiddenHandles`. A new read route that queries posts directly can leak; the
  route table in the privacy spec plus this one are the review checklist.
- `blockedHandles` adds one indexed query (two directions) to every feed load.
  Acceptable now; if it grows, denormalise onto the session or cache per request.
