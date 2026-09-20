# Sessions, archive and activity log — design record

Slices 4–6 of the Account Center, built together. Written after the fact to record
the decisions; the behaviour is pinned by `e2e/api-sessions.spec.ts`,
`api-archive.spec.ts`, `api-activity-log.spec.ts` and `account-center.spec.ts`.

## Sessions (device management)

**Problem:** sessions were stateless signed cookies, so nothing could be listed or
revoked.

- Token payload gains `sid` and `iat`. A `sessions` collection holds one row per
  sign-in `{ sid, user_id, handle, user_agent, created_at, last_seen_at, expires_at }`
  (unique `sid`, TTL on `expires_at`). No IP is stored.
- `validateSession` rejects a token whose `sid` has no row, or whose issue time
  precedes the user's `sessions_revoked_before` stamp. `last_seen_at` is written at
  most every 10 minutes.
- **Legacy cookies keep working.** They have no `sid`; their issue time is
  `exp - 90 days`. `/api/auth/me` runs on every app load and re-issues the cookie, so
  it upgrades a legacy cookie to a tracked session with no migration.
- **Sign out everywhere / other devices** stamp `sessions_revoked_before`: that is the
  only way to end legacy tokens, which can't be listed individually. "Other devices"
  then re-issues the current cookie so it survives its own stamp.
- Re-issue sites (`me`, `verify` when already signed in, `PUT /api/profile`,
  revoke-others) pass the current `sid` so they never spawn extra rows.
- `POST /api/auth/sign-out` deletes the device's row, so a copied cookie is dead.
- API: `GET /api/account/sessions`; `POST` with `revoke {sid}`, `revoke_others`,
  `revoke_all`. Revoking is scoped to the caller's own rows (someone else's `sid` is a 404).
- **Not done:** the proxy still validates page access by signature only (no DB, by
  design), so a revoked cookie can load the static `/app` shell; every API call is
  rejected and the app shows signed out. Coarse location or IP per device is
  deliberately omitted.

## Archive

- `posts.archived: true` (+ `archived_at`). An archived take is visible to its
  **author only**: excluded from every list (feed, `?handle=`, `?tagged=`,
  `prompt_day`, prompt peers, weekly digest, quoted-post hydration) and 404 on every
  single-post read or interaction for anyone else.
- One helper, `canViewPost` in `visibility.ts`, decides single-post access (archive,
  privacy and blocks together). Quoting an archived take is refused.
- `POST /api/posts/[id]/archive { archived: boolean }`, author only (403 otherwise).
  `GET /api/posts?archived=1` lists the caller's own archive.
- UI: an Archive button beside Delete on your own profile; an Archive section in the
  Account Center with Unarchive.
- **Not done:** aggregate counts (feelings, pulse, sentiment) still include archived
  takes, consistent with the privacy slice; archive from feed cards.

## Activity log ("Your activity")

- `GET /api/account/activity?type=all|posts|replies|reactions|follows`: the caller's own
  history merged from `posts`, `messages`, `reactions` and `follows` (40 per source, newest
  60 overall). No separate log store, so it can never drift from the data.
- **Previews of other people's takes appear only while the caller can still see them**
  (not archived, not hidden by privacy or a block); otherwise the entry stays without text.
- Private to its owner. Not the notifications feed (`/api/activity`), which is incoming.
- **Not done:** account events such as privacy changes and sign-ins are not logged (they
  aren't recorded anywhere today).

## Operational notes

- The e2e suite now signs in about 35 accounts against the 40/hour global sign-in cap
  (and 3 per email per 15 minutes). New specs should share accounts where possible.
- Browser specs set `X-Forwarded-For` per test so they don't spend the proxy's shared
  per-IP request budget.
