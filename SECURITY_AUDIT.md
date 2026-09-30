# Security Audit — AiTo (ai-thoughts)

**Date:** 2026-09-30  **Scope:** this local repository only (web app, API, Electron shell, Capacitor config, git history). No requests were sent to production or any live service. `npm audit` was the only network call; it sends package names and versions to the npm registry.

---

## 1. What the app is

| | |
|---|---|
| **Stack** | Next.js 16.3 (App Router) + React 19, TypeScript, MongoDB (Atlas), Vercel Blob for media, Upstash Redis (optional), Resend email, Web Push, Sentry |
| **Type** | Social network for short text, audio, video and photo "takes". It ships as a website/PWA, as iOS/Android apps (Capacitor loading `https://aito.social`) and as a Windows/macOS Electron shell loading the same site. |
| **AI usage** | OpenAI moderation (text and images) and Whisper transcription for screening only. The model output is a yes/no flag or a transcript, and no tools are exposed, so the attack surface for prompt injection is minimal. |

### Entry points
- **Pages:** `/app` (main UI), `/admin`, `/keeper`, `/owner`, `/sign-in`, static legal pages, `/sentry-example-page`
- **Auth:** `POST /api/auth/sign-in` (email OTP), `/verify`, `/me`, `/sign-out`
- **Content:** `/api/posts` (+ `[id]`, `/messages`, `/reactions`, `/report`, `/view`, `/archive`), `/api/profile`, `/api/follows`, `/api/blocks`, `/api/mutes`, `/api/mood`, `/api/search`, `/api/people`, `/api/feelings/*`, `/api/prompt/peers`
- **Account:** `/api/account` (export/delete), `/account/privacy`, `/account/sessions`, `/account/activity`, `/api/prefs`, `/api/push/subscribe`
- **File upload:** `POST /api/upload`. It issues Vercel Blob client-upload tokens, and the browser uploads straight to Blob.
- **Moderation/admin:** `/api/reports`, `/api/reports/[id]`, `/api/contact`, `/api/keepers`, `/api/admin/controls|me|seed`, `/api/owner/metrics`
- **Background jobs:** `/api/cron/activity-digest`, `/weekly-voices`, `/backup` (Vercel Cron with a Bearer `CRON_SECRET`)
- **Unauthenticated utilities:** `/api/translate` (proxies to MyMemory), `/api/health`, `/api/site`, `/api/push/vapid`, `/api/sentry-example-api`

### How auth works
- **Sign-in:** email OTP. The 6-digit code is stored as an HMAC and compared in constant time. Each code allows 5 attempts, spent atomically, and expires after 10 minutes. There are rate limits per IP, per email and site-wide, plus optional Turnstile.
- **Session:** an HMAC-signed JSON cookie (`aithoughts.session`) that is httpOnly, SameSite=Lax, Secure in production and valid for 90 days. It carries `{id, handle, displayName, sid}`. On each request `validateSession` checks the signature, checks a server-side `sessions` row (so revocation works) and checks a "sign out everywhere" timestamp.
- **CSRF:** SameSite=Lax, plus an Origin/Referer check in `src/proxy.ts` on every cookie-bearing mutation.
- **Authorization:** checked in each route handler. Roles are **looked up by handle string**: admins come from the `ADMIN_HANDLES` env var or the `admins` collection, and keepers from the `keepers` collection. Post ownership is also checked by handle in most places. This design choice is the root of the top findings.
- **Privileged machine access:** Bearer secrets (`CRON_SECRET`, `ADMIN_SEED_SECRET`, `OWNER_DASHBOARD_SECRET`), compared in constant time and rate-limited per IP.

---

## 2. Overall risk

**Overall: Moderate.** The baseline is better than typical:
- Crypto, OTP, CSRF, SSRF (push endpoints) and upload type checks are done carefully.
- Security headers and CSP are present.
- No secrets were found in git history.
- No classic injection or XSS sinks were found.

The serious problems are **authorization design flaws**, not missing checks. Identity and roles are tied to a *renameable, reclaimable handle string* instead of the immutable user ID. As a result:
1. Someone can inherit moderator or admin powers.
2. Blocked users can walk around a block.
3. Stale sessions act under someone else's name.

Separately, media files have no owner, so one user can delete another user's uploads.

| Severity | Count |
|---|---|
| Critical | 0 (H1 becomes Critical if an orphaned role row exists today; see Quick win #1) |
| High | 4 |
| Medium | 5 |
| Low | 9 |

---

## 3. Findings (sorted by severity)

### H1 — Moderator/admin powers can be inherited by claiming a freed handle
**Severity:** High (Critical if an orphaned row exists in production)
**Files:**
- [src/lib/admin.ts:24-36](src/lib/admin.ts#L24-L36) (`isAdminHandle`)
- [src/lib/auth.ts:255-267](src/lib/auth.ts#L255-L267) (`isKeeperHandle`)
- [src/app/api/profile/route.ts:171-242](src/app/api/profile/route.ts#L171-L242) (the rename migrates many collections, but not `keepers` or `admins`)
- [src/lib/auth.ts:405-508](src/lib/auth.ts#L405-L508) (account deletion leaves `keepers` and `admins` rows behind)
- [src/app/api/keepers/route.ts:20-22](src/app/api/keepers/route.ts#L20-L22) (acts as an oracle)

**Risk:** Roles are granted to a *handle string*. When a keeper or admin renames themselves or deletes their account, their row in `keepers`/`admins` stays behind, and the old handle becomes free to register. The sign-in and rename "taken" checks look only at `users`. The same applies to:
- any handle listed in `ADMIN_HANDLES` that has not been registered yet;
- any keeper an admin added before that person signed up.

**Exploit in plain terms:**
1. A moderator `@sam` renames to `@samuel`.
2. An attacker signs up with the username `sam`.
3. Every `isKeeperHandle(session.handle)` check now passes. The attacker can read all reports and contact messages, delete any post and ban any user. If `@sam` was an admin, the attacker also gets the admin console (add admins, toggle maintenance, read audit logs with IPs).

Finding a target is easy. `GET /api/keepers?handle=X` answers `isKeeper: true` even for handles no user owns, and it has no rate limit beyond the global backstop of 300 requests per 5 minutes.

**Fix:**
- **Proper:** store roles on the user record (`users.role` or `admins.user_id`) and check them with `session.id`.
- **Minimum patch:**
  - move or delete `keepers`/`admins` rows inside the rename in `profile/route.ts` and inside `deleteUserAccount`;
  - have `isAdminHandle`/`isKeeperHandle` also require a `users` row whose current handle matches;
  - reject sign-up or rename to any handle that has a role row;
  - make `/api/keepers` keeper-only, or delete it.

---

### H2 — Renaming breaks blocks and mutes (block evasion)
**Severity:** High (safety impact on a social app)
**Files:**
- [src/app/api/profile/route.ts:171-242](src/app/api/profile/route.ts#L171-L242): `blocks`, `mutes` and `moods` are not migrated
- [src/lib/blocks.ts:13-19](src/lib/blocks.ts#L13-L19)

**Risk:** Block rows store `@handle`. The rename path updates posts, follows, messages and similar collections, but not `blocks` or `mutes`.

**Exploit in plain terms:**
- A harasser `@x` who was blocked renames to `@x2`. The block row still says `@x`, so they can immediately see, reply to and react to the victim's takes again. The victim's UI shows nothing wrong.
- The reverse also happens: a user who renames silently loses every block they set.
- Whoever later registers `@x` inherits the old block rows.

Mood history (`moods.handle_norm`) is also orphaned. That is a data-loss and privacy leftover, not an exploit.

**Fix:** In the rename block, add `updateMany` for `blocks.blocker`, `blocks.blocked`, `mutes.muter`, `mutes.muted` and `moods.handle_norm`. Long term, key these rows by user ID.

---

### H3 — Media files have no owner: users can delete others' media or republish private media
**Severity:** High
**Files:**
- [src/app/api/posts/route.ts:655-671](src/app/api/posts/route.ts#L655-L671) (checks the host only)
- [src/app/api/profile/route.ts:104-108](src/app/api/profile/route.ts#L104-L108)
- [src/lib/moderation.ts:38](src/lib/moderation.ts#L38)
- [src/lib/auth.ts:438-442](src/lib/auth.ts#L438-L442)
- [src/app/api/upload/route.ts:71-76](src/app/api/upload/route.ts#L71-L76) (`userId` is put in the token payload but never recorded)

**Risk:** `media_url` and `avatarUrl` are accepted if they point at *our* Blob store. The app never checks that the caller uploaded the file. Deleting a post or an account deletes every blob URL on it.

**Exploit in plain terms:**
- **Deletion:** An attacker copies a victim's avatar URL (public in search) and sets it as their own avatar, then deletes their account. The server deletes the victim's avatar file. Takes work the same way: strip the query string from the signed link a viewer receives, attach it to your own post, then delete that post.
- **Privacy bypass:** A follower of a *private* account attaches that account's audio or video to their own *public* take, so strangers can play it.

*Needs verification:* whether Vercel Blob presigned URLs expose the object pathname. They almost certainly do, since the file path sits in the URL.

**Fix:** Record ownership when the upload finishes. Either:
- insert `{pathname, userId}` in `onUploadCompleted`, or
- force the pathname to start with `take-<userId>-` / `avatar-<userId>-` in `onBeforeGenerateToken`.

Then reject `media_url`/`avatarUrl` values the caller does not own, and only delete blobs owned by the post's author.

---

### H4 — Outdated Electron desktop shell (many high advisories)
**Severity:** High
**Files:**
- [desktop/package.json](desktop/package.json) (`electron ^37.2.0`)
- [desktop/main.js:33-49](desktop/main.js#L33-L49)

**Risk:** `npm audit` reports 2 high-severity packages covering about 35 Electron advisories: context-isolation bypass, sandboxed iframes launching external protocol handlers, use-after-frees and others. It also reports an `extract-zip` symlink traversal. The fix requires Electron 44.5.0 or later. The shell loads a remote site, so any XSS or compromised third-party frame on `aito.social` meets an unpatched Chromium/Electron. Also, `shell.openExternal(url)` is called for *any* scheme on `window.open` or cross-origin navigation. On Windows, `ms-msdt:`/`search-ms:`-style handlers have historically led to code execution.

**Exploit in plain terms:** A malicious link or frame in the site triggers a known Electron bug, or opens a dangerous protocol handler, on a desktop user's machine.

**Fix:**
- Upgrade Electron (a major version bump; test the auto-updater).
- In both handlers, only call `openExternal` when `new URL(url).protocol` is `https:` or `mailto:`.

I found no user-controlled `href`s in the UI today, so the `openExternal` part has limited reach for now.

---

### M1 — Rate limits are per-instance unless Upstash is set, and fail open on Redis errors
**Severity:** Medium (*Needs verification:* production env)
**File:** [src/lib/rate-limit.ts:8-10, 38-45, 71-91](src/lib/rate-limit.ts#L8-L91)

**Risk:** Without `UPSTASH_REDIS_REST_*`, every serverless instance keeps its own counters. Your local `.env.local` has no Upstash vars. That weakens all of these:
- OTP per-email limits (about 25 guesses/hour per inbox by design; this scales with the number of warm instances)
- the site-wide email cap
- Bearer-secret attempt limits
- post, reply and upload limits

When Upstash *is* configured, any Redis error returns `ok: true` for **every** key, auth ones included.

**Exploit in plain terms:** A distributed burst lands on many instances at once, and each one allows the full quota. If Redis has an outage, all limits switch off.

**Fix:**
- Confirm Upstash is set in the Vercel production env.
- Fail **closed** for `sign-in*`, `verify:*` and `bearer-auth:*` keys, and keep failing open for low-risk keys.

---

### M2 — Editing a take bypasses AI content screening
**Severity:** Medium
**Files:**
- [src/app/api/posts/[id]/route.ts:171-201](src/app/api/posts/%5Bid%5D/route.ts#L171-L201)
- compare with [src/app/api/posts/route.ts:679](src/app/api/posts/route.ts#L679)

**Risk:** New takes go through `isFlaggedContent` (OpenAI moderation). `PATCH` edits only run the local `checkDignity` word filter, and have no rate limit.

**Exploit in plain terms:** Post something harmless, let it pass screening and collect engagement, then edit it into content the screening would have blocked.

Replies ([messages/route.ts:88](src/app/api/posts/%5Bid%5D/messages/route.ts#L88)) likewise skip `isFlaggedContent`. That may be intentional for cost, but it is worth a decision.

**Fix:** Call `isFlaggedContent({ text: content })` in `PATCH` before the update, and add a per-account edit rate limit.

---

### M3 — Any member can instantly hide any take by filing a "child safety" report
**Severity:** Medium (business-logic abuse)
**Files:**
- [src/app/api/reports/route.ts:179-182](src/app/api/reports/route.ts#L179-L182)
- [src/app/api/posts/[id]/report/route.ts:91](src/app/api/posts/%5Bid%5D/report/route.ts#L91)

**Risk:** A `CHILD_SAFETY` report calls `holdPost` right away, with no reporter trust, no account-age check and no threshold. The only limit is 20 reports per 10 minutes per IP, which is weak without Upstash (M1).

**Exploit in plain terms:** A brigade of fresh accounts files false child-safety reports and a target's takes disappear until a keeper reviews each one. Each attacker account can hide about 120 posts per hour.

**Fix (product decision):** Keep the fast path, but gate it:
- auto-hold only if the reporter's account is older than N days, or after 2 or more distinct reporters;
- cap child-safety reports per account per day;
- track the reporter's false-report rate.

---

### M4 — Upload storage and cost abuse
**Severity:** Medium
**File:** [src/app/api/upload/route.ts:36, 63-65](src/app/api/upload/route.ts#L36-L65)

**Risk:**
- The size cap is 150 MB for every type, images included.
- The limit is 20 uploads per 10 minutes **per IP** (per-instance, see M1), with no per-account quota.
- Blobs that never become a post are never cleaned up.

**Exploit in plain terms:** One account uploads about 3 GB every 10 minutes from each IP it controls, and the files stay in Blob storage and on your bill.

**Fix:**
- Add a per-user limit (key on `session.id`).
- Set caps per type (for example 10 MB for images).
- Add a cron job that deletes blobs older than 24 hours that no post or profile references (this needs the ownership record from H3).

---

### M5 — Session identity comes from the cookie, not the database
**Severity:** Medium
**Files:**
- [src/lib/auth.ts:206-246](src/lib/auth.ts#L206-L246)
- ownership-by-handle at [src/app/api/posts/[id]/route.ts:152, 227](src/app/api/posts/%5Bid%5D/route.ts#L152)

**Risk:** `validateSession` loads the user row but returns `payload.handle` from the cookie. It never checks that the user still exists or is not suspended. After a rename, the user's *other* devices keep acting as the old handle until they call `/api/auth/me`. If someone else has claimed that handle (see H1), those stale cookies pass handle-based checks on the new owner's data: edit or delete posts, archive, notifications, prefs. Legacy tokens without a `sid` also survive a ban (`banUser` deletes `sessions` rows but does not stamp `sessions_revoked_before`, see [moderation.ts:76](src/lib/moderation.ts#L76)) and survive account deletion.

**Fix:** In `validateSession`:
- return `null` if `!user || user.suspended`;
- return `handle: user.handle` and `displayName: user.displayName` from the DB.

This is about 3 lines, and the user row is already loaded. Longer term, check post ownership by `user_id` (the `archive` route already does).

---

### L1 — `/api/translate` is an unauthenticated open relay
**File:** [src/app/api/translate/route.ts](src/app/api/translate/route.ts)

Anyone can use your server to call MyMemory. That burns its per-server-IP free quota for real users. It also writes an unbounded `translations` cache (up to 4.5 KB per entry, no TTL), and upstream error text is echoed back. **Fix:** require a session, and add a TTL index on `translations`.

### L2 — `/api/health` does work for anonymous callers, and its secret check is not attempt-limited
**File:** [src/app/api/health/route.ts:19-60](src/app/api/health/route.ts#L19-L60)

Every anonymous hit runs `ensureCoreIndexes` (dozens of `createIndex` calls). `hasSecret` duplicates the Bearer logic and skips the per-IP attempt limiter in `authorizeBearer`. **Fix:** run the index check only for authorized callers or once per instance, and reuse `authorizeBearer`.

### L3 — CSP allows inline scripts in production
**File:** [next.config.ts:10](next.config.ts#L10)

`script-src 'unsafe-inline'` removes most of the protection CSP would give if an XSS bug ever appears. **Fix:** switch to nonce-based CSP, which Next supports through middleware/proxy nonces.

### L4 — Temporary Sentry test route and page are still shipped
**Files:** [src/app/api/sentry-example-api/route.ts:1-2](src/app/api/sentry-example-api/route.ts#L1-L2), `src/app/sentry-example-page/`

The code itself says to delete them once verified. They let anyone generate Sentry events (rate-limited). **Fix:** delete both.

### L5 — Reporters can put misleading text in the keeper queue
**Files:** [src/app/api/reports/route.ts:104-107](src/app/api/reports/route.ts#L104-L107), [posts/[id]/report/route.ts:83-86](src/app/api/posts/%5Bid%5D/report/route.ts#L83-L86)

For post reports, `content_snippet` comes from the client, so a keeper may act on text the post never contained. **Fix:** always build the snippet from the stored post or comment.

### L6 — Anonymous view-count inflation
**File:** [src/app/api/posts/[id]/view/route.ts:49-51](src/app/api/posts/%5Bid%5D/view/route.ts#L49-L51)

A client that drops the `aithoughts.anon` cookie gets a fresh viewer ID on every call. That allows about 300 fake views per 10 minutes per IP. **Fix:** count only signed-in views, or dedupe anonymous views by IP+UA hash.

### L7 — Owner dashboard secret falls back to `CRON_SECRET` and is kept in `sessionStorage`
**Files:** [src/app/owner/page.tsx:146](src/app/owner/page.tsx#L146), [src/app/api/owner/metrics/route.ts:18](src/app/api/owner/metrics/route.ts#L18)

An XSS (made easier by L3) could read the secret. If `OWNER_DASHBOARD_SECRET` is unset, that secret is `CRON_SECRET`, which also unlocks backups, seeding and admin bootstrap. **Fix:** set a dedicated `OWNER_DASHBOARD_SECRET` and remove the `CRON_SECRET` fallback, or gate `/owner` behind the admin session instead.

### L8 — Sensitive files on this machine (not in git)
None of these is committed, and `.gitignore` covers each one. They are still worth cleaning up on a laptop:
- `../jar.txt` (outside the repo) holds a **live session cookie** (localhost, expires Dec 2026).
- `backups/aithoughts-2026-09-29….json.gz` is a real database dump with handles, posts and encrypted emails.
- `.env.local` holds live production credentials: Mongo URL, Resend, Blob, Vercel OIDC and `AUTH_SECRET`.
- `.env.sentry-build-plugin` holds `SENTRY_AUTH_TOKEN`.

**Fix:** delete `jar.txt`, move or encrypt local backups, and rotate the tokens if this machine is shared or backed up to a cloud drive.

### L9 — Dependency findings (web app)
`npm audit` found 1 high and 3 moderate issues, all **dev or build-time only**:
- `brace-expansion` ReDoS, via eslint and `@capacitor/cli` → `rimraf`/`glob`
- `uuid` and `xcode`, via `@capacitor/cli`

None of these runs in production request handling. `next` is pinned at 16.3.4 while 16.3.7 is out. *Needs verification:* whether those patch releases include security fixes. If so, upgrade. Run `npm audit fix` for `brace-expansion`.

---

## 4. Checked and found OK

- **Injection:** Search regexes are escaped and length-capped. Mongo queries use type-checked scalars, and I found no raw body objects reaching queries. There is no `$where`, no `eval` and no `dangerouslySetInnerHTML`. Email templates HTML-escape user data.
- **CSRF:** Covered by SameSite=Lax plus the Origin/Referer check (`src/proxy.ts:40-53`).
- **SSRF:** Push endpoints must be `https`, and every DNS-resolved IP is checked against private ranges (`src/lib/push.ts`). Media URLs are pinned to your own Blob store IDs. The translate and moderation URLs are fixed.
- **OTP:** 6 digits from `randomInt`, HMAC-stored, constant-time compare, atomic attempt counter, 10-minute TTL, email-existence oracle removed from sign-in.
- **Cron, seed and bootstrap:** Fail closed with no secret, including in non-production. The insecure-dev opt-in is ignored on Vercel.
- **Open redirect:** `safeRedirectPath` is used and tested.
- **Private media:** Served via 1-hour signed links, and only after `canViewPost`.
- **Headers:** HSTS preload, `frame-ancestors 'none'`, `nosniff`, COOP and a strict Referrer-Policy are set.
- **Secrets in git:** Across 181 commits, no `.env` file was ever committed and no key patterns matched (Mongo URI with password, `sk-`, `re_`, `vercel_blob_rw_`, `sntrys_`, AWS, PEM). This was a pattern scan, not Gitleaks, so see §6.
- **LLM:** Moderation and transcription only. The model output is a boolean or a transcript rendered as text, with no tools and no system prompt carrying secrets. Screening fails open, which is documented and intentional.

---

## 5. Quick wins you can do today

1. **(5 min, do first)** In Atlas, list `keepers` and `admins` rows whose handle matches no `users.handle`, and delete them. Also confirm every `ADMIN_HANDLES` entry is a registered account. This closes H1's live exposure.
2. **(10 min)** `validateSession`: reject missing or suspended users and return the handle from the DB (M5).
3. **(20 min)** Rename path: also migrate `blocks`, `mutes`, `moods`, `keepers` and `admins`. Deletion path: also delete `keepers` and `admins` rows (H1, H2).
4. **(5 min)** Add `isFlaggedContent` to `PATCH /api/posts/[id]` (M2).
5. **(5 min)** Confirm Upstash env vars are set in Vercel production (M1).
6. **(2 min)** Delete `sentry-example-api` and `sentry-example-page` (L4), and delete `../jar.txt` (L8).
7. **(5 min)** Electron: restrict `openExternal` to `https:`/`mailto:` (H4, partial). Schedule the Electron upgrade.

---

## 6. Recommended ongoing tooling (not installed)

- **Gitleaks:** `gitleaks detect --source . --log-opts="--all"` as a pre-commit hook and in CI. It gives full-history secret scanning beyond the pattern grep used here.
- **Semgrep:** `semgrep --config p/nextjs --config p/typescript --config p/owasp-top-ten` in CI.
- **Dependabot or Renovate:** covers both `package.json` files. The Electron lag in H4 is exactly what this catches.
- **`npm audit --omit=dev --audit-level=high`** as a CI gate, so dev-only noise does not block builds.
