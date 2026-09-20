# Account privacy (public / private / locked) — design

Slice 1 of the Account Center. Later slices (blocking, notification settings,
device permissions, help, sessions, archive, activity log) get their own specs.

## Goal

A user can set their account to **public**, **private** or **locked**. The
setting is enforced on every route that returns their posts or identity, not
just hidden in the UI.

## Non-goals

- Blocking, muting, sessions, archive, activity log (later slices).
- Hiding a private user's posts from anonymous aggregates (feeling counts,
  pulse stats, sentiment dashboard). These carry no text or attribution.
  Revisit if that turns out to matter.
- Moderator lockout: `/admin`, `/keeper` and `/owner` routes read the DB
  directly and are unchanged, so moderation still sees everything.

## Behaviour

| | Public | Private | Locked |
|---|---|---|---|
| Posts visible to | everyone | self + approved followers | self + approved followers |
| Profile shell (name, avatar, bio) | everyone | everyone | self + approved followers |
| Follower / following lists | everyone | self + approved followers | self + approved followers |
| Appears in people search | yes | yes | only to approved followers |
| New follows | instant | pending until approved | rejected |
| Can be reposted / quoted | yes | no | no |

Transitions, all keeping existing approved followers:
- any → public: pending requests are approved.
- any → locked: pending requests are declined.
- public → private: nothing else changes.

Existing quote-reposts of a post the viewer can't see render a "private post"
placeholder (the feed already null-handles a missing quoted post).

## Data model

- `profiles.privacy`: `"public" | "private" | "locked"`. Missing = public, so
  no backfill. Written by a new endpoint; the existing profile `PUT` must not
  touch it.
- `follows.status`: `"pending" | "approved"`. Missing = approved (legacy rows).
  Every follower list, count and "who do I follow" query filters
  `status: { $ne: "pending" }`.

## Core module: `src/lib/visibility.ts`

- `decideVisibility(privacy, { isSelf, isApprovedFollower })` — pure, unit
  tested against the full matrix.
- `getPrivacy(db, handle)` and `canView(db, viewer | null, owner)` — DB wrappers.
- `hiddenAuthorFilter(db, viewer | null)` — returns a Mongo filter
  `{ handle: { $nin: [...variants] } }` covering every restricted author the
  viewer cannot see. Computed *before* the posts query so `limit` still fills;
  post-filtering would shrink pages. It uses its own follows query scoped to the
  restricted set rather than `listFollowing`, which caps at 200 rows and would
  silently drop access for heavy followers.
  `// ponytail: $nin list, fine for hundreds of restricted accounts;
  denormalise privacy onto posts or use $lookup if that grows.`

Handles are stored as `@x`, `x` or mixed case in the wild, so all lookups reuse
the existing `handleVariants` / `normHandle` helpers.

## Follow flow

- `followUser` reads the target's privacy: public → `approved`; private →
  `pending`; locked → rejected ("not accepting followers").
- `unfollowUser` on a pending row cancels the request.
- `POST /api/follows` gains `action: "approve" | "decline"` (`handle` = the
  requester); only the followed account may call it.
- `GET /api/follows/requests` lists the caller's pending requests.
- `POST /api/follows` follow response adds `requested: true` when pending.
- New helper `getFollowState(db, viewer, owner)` → `none | requested | following`
  for the profile and people-search buttons.

## Enforcement surface

Every place found by audit that reads another user's posts or identity:

| Route / module | Change |
|---|---|
| `GET /api/posts` (feed, `?handle=`, `?tagged=`, `?prompt_day=`) | merge `hiddenAuthorFilter` into every branch; hydrate quoted posts through `canView` |
| `GET /api/posts/[id]` | 404 unless `canView` |
| `POST /api/posts/[id]/messages`, `reactions`, `view`, `report` | 404 unless `canView` |
| `POST /api/posts` with `quoted_post_id`; repost reaction | reject if the original is private/locked |
| `GET /api/profile` | shell for private; `null` for locked; both to non-viewers |
| `GET /api/follows` | lists hidden from non-viewers; keep `isFollowedByMe` |
| `GET /api/people` | exclude locked for non-followers, in search and suggestions; return follow state |
| `GET /api/prompt/peers` | `peers` mode: add `hiddenAuthorFilter` (currently leaks post previews); `catchup` mode: rely on approved-only `listFollowing` |
| `GET /api/cron/weekly-voices` | only public authors in `highlights` (currently emails platform-wide latest posts) |
| `notifyFollowersOfPost` | approved followers only (via `listFollowers`) |
| `notifyMentions` | on a private/locked author's thread, skip mentioned users who can't view; stops the comment preview leaking through push |
| `notifyPostOwner` | no change; the actor already passed `canView` in the calling route |
| `deleteUserAccount` | no change: already deletes the profile row and follows in both directions |

## API and UI

- `GET/PUT /api/account/privacy` — read and set the caller's `privacy`;
  applies the transitions above. No dedicated rate limit: it only changes the
  caller's own setting, and `src/proxy.ts` already caps mutating `/api` calls per
  IP, as it does for `PUT /api/profile` and `POST /api/follows`.
- New `AccountCenter` component, opened from an "Account Center" row in
  ProfileView as a sub-view of the You tab. The app navigates by tab state
  inside `/app`, so no new route (and no new entry in the proxy's protected
  paths). It holds the three-way control, a one-line plain-language description
  of each state, and a pending-requests list with approve/decline. Later slices
  add their sections to the same component.
- Profile and people-search buttons: Follow / Requested / Following, and a
  "This account is private" panel in place of posts.

## Testing

- **Unit** (`node --test`, matches existing `npm test`): `decideVisibility`
  matrix; transition rules.
- **E2E** (Playwright request contexts; each sends an `Origin` header, see
  `e2e/api-post-actions.spec.ts`): A private, B stranger, C approved follower.
  B gets 404 on A's post, and A's posts are absent from B's feed and
  `prompt/peers`. B's follow becomes `requested`, A approves, B now sees it.
  Locked account rejects follows and drops out of B's search. Quote of a
  private post is rejected.

## Risks

- Coverage is only as good as the route list above; a new read route added
  later can leak. Mitigation: `visibility.ts` is the single import for the
  check, and the table above is the review checklist.
- `hiddenAuthorFilter` runs on every feed load. Two indexed queries; acceptable
  now, flagged with the `ponytail:` note for scale.
