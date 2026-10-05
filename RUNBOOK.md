# Ops runbook (must-do for live Voices)

## Global admin console (private)

Not linked from Voices. Bookmark:

`https://YOUR_APP/admin`

1. Sign in on the site and open `/admin`. It shows "No admin access" with your **user id**.
2. Set `ADMIN_USER_IDS` on Vercel to that id (comma-separated for more), redeploy, reload `/admin`.
   Roles follow the account, not the handle, so renaming yourself keeps admin and nobody who later
   registers your old handle gets it. (`ADMIN_HANDLES` is no longer honored.)
3. From there you can: seed the feed, add/remove keepers & admins, toggle maintenance, delete any take, jump to `/owner` metrics and `/keeper` moderation.

**One-time bootstrap** (if you prefer DB over env):

```bash
curl -sS -X POST https://YOUR_APP/api/admin/controls \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"bootstrap","handle":"@yourhandle"}'
```

Admins inherit keeper powers automatically.

## Owner engagement dashboard (private)

Not linked from Voices. Bookmark:

`https://YOUR_APP/owner`

1. Set `OWNER_DASHBOARD_SECRET` on Vercel — its own value, not `CRON_SECRET` (which is no longer accepted here).
2. Open `/owner`, paste the secret, Refresh.
3. See today / 7d / 30d users & takes, WoW trend, feelings mix, active posters.

API (for scripts):

```bash
curl -sS https://YOUR_APP/api/owner/metrics \
  -H "Authorization: Bearer $OWNER_DASHBOARD_SECRET" | jq .
```

## Before inviting people

1. **Vercel env** (Production): `AUTH_SECRET`, `MONGODB_URL`, `CRON_SECRET`, Resend (`RESEND_API_KEY` + verified `EMAIL_FROM`), Blob, VAPID keys.
2. **Health**: open `https://YOUR_APP/api/health` — expect `"ok": true`. Fix any `missing_required`.
3. **Atlas**: network restriction + least-privilege DB user + **Cloud Backup enabled**.
4. **Keepers**: only trusted handles in the `keepers` collection.
5. Sign in once; confirm user docs use `emailEnc` / `emailHash` (not plaintext `email`).

## Smoke checklist (15 min)

- [ ] Friend receives OTP and stays signed in after refresh
- [ ] Answer today’s prompt → appears in **Today’s prompt** lane
- [ ] Feel with from post-share peers
- [ ] React on someone else’s take → they get activity (and push if enabled)
- [ ] You → **Download my data** returns JSON
- [ ] You → **Delete my account** (use a throwaway) wipes session
- [ ] Non-keeper cannot load keeper report APIs
- [ ] `GET /api/cron/activity-digest` without Bearer → 401

## Incidents

| Symptom | Check |
|---------|--------|
| OTP not arriving | Resend dashboard + `EMAIL_FROM` domain verified; `/api/health` recommended env |
| 503 on health | Missing `AUTH_SECRET` / `MONGODB_URL` / `CRON_SECRET`, or Atlas down |
| Cron digests silent | Vercel Cron + `CRON_SECRET` match; Authorization Bearer on cron |
| Login broken after secret rotate | Email decrypt/hash uses `AUTH_SECRET` unless `EMAIL_ENCRYPTION_KEY` is set — restore old key or set dedicated encryption key |

## Useful curls

```bash
curl -sS https://YOUR_APP/api/health | jq .

curl -sS -o /dev/null -w "%{http_code}\n" \
  https://YOUR_APP/api/cron/activity-digest

curl -sS -X POST https://YOUR_APP/api/admin/seed \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Launch settings (code is in place — these switch it on)

| What | Where | Why |
| --- | --- | --- |
| Resend DNS for the sending domain | Resend → Domains → add `aito.social`, then copy its records (MX + SPF TXT on `send.aito.social`, DKIM TXT on `resend._domainkey.aito.social`) into the registrar. Add `_dmarc.aito.social` TXT `v=DMARC1; p=none; rua=mailto:keepers@aito.social`. Set `EMAIL_FROM="AI·Thoughts <hello@aito.social>"`. | Live — verified 2026-10-05: MX + SPF on `send.aito.social`, DKIM on `resend._domainkey.aito.social`, and DMARC on `_dmarc.aito.social` all resolve. Without them, codes from `@aito.social` get refused or land in spam. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile (free), hostname `www.aito.social` | CAPTCHA on "Send sign-in code". Without it a few IPs can drain the email cap and block every new sign-in. |
| `OTP_EMAILS_PER_HOUR` | Vercel env | Site-wide sign-in email cap (default 40). Size to the Resend plan. |
| `OPENAI_API_KEY` | platform.openai.com (moderation is free) | Screens take text, photos and avatars. Audio/video are not screened — keepers + reports cover them. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | upstash.com (free tier) | Rate limits shared across serverless instances; without it each instance counts separately. |
| Error alerts | Sentry (`npx @sentry/wizard -i nextjs`) or Vercel → Observability alerts on 5xx | Routes catch and log their own errors, so alerting must watch logs/5xx, not just crashes. |

After deploying, open `/api/health` once: it builds the new unique index on `users.handle` (checked 2026-09-28: 0 duplicates, so it builds cleanly).

**Before every release:** `npm test`, `npm run test:e2e`, and the live gate `npm run prelaunch` (see `scripts/prelaunch-check.mjs`) against a dev server on a throwaway DB.

**Local dev warning:** `.env.local`'s `MONGODB_URL` points at the Atlas cluster. Use a separate database (or `e2e/start-test-mongo.sh`) for local work and tests so nothing writes to live data.

## Backup restore drill (do once, ~20 min)

**Current state: production has no managed backups.** `atlas-teal-basket` runs
on the Atlas **Free Plan (M0)**, which does not offer Cloud Backup or snapshots
at any setting — there is no snapshot to restore. The manual dump below is
currently the only backup that exists. Re-check this before inviting real users.

> **Since 2026-09-29 this is automated.** `/api/cron/backup` runs daily at 04:30
> UTC, writes a verified archive to Vercel Blob under `backups/`, and prunes to
> the newest `BACKUP_KEEP` (default 14). It is guarded by `CRON_SECRET` and
> refuses to upload if the Blob token cannot store the archive as **private** —
> the archives contain real handles and post text, so a public store is a
> disqualifying failure, not a fallback.
>
> The main store (`BLOB_READ_WRITE_TOKEN`) is **public-only**, so the cron
> writes to the private store in `BLOB_PRIVATE_READ_WRITE_TOKEN`. Until that is
> set, every run fails with the "rejected access: private" error. Check
> `backups/` in that store after the first night.

The point of the drill is to produce numbers you can act on: how long a restore
takes, and how much data a restore would cost you. Do not accept "it looked
fine" as the result.

0. **Take a dump** (optional now that the cron runs, but do it once by hand so
   you have a copy that does not depend on the schedule working):

   ```bash
   MONGODB_URL="$LIVE_URL" MONGODB_DB=aithoughts npm run db:dump
   ```

   Writes `backups/aithoughts-<timestamp>.json.gz` (gitignored — it holds real
   user data). `mongodump` is not installable via Homebrew and the MongoDB
   downloads are region-blocked, so this writes canonical Extended JSON instead:
   `ObjectId` / `Date` / `Decimal128` / `Long` round-trip exactly, and
   `scripts/mongo-restore.mjs` puts them back. The archive records every index,
   so a restore rebuilds the schema, not just the rows.

   Both the CLI and the cron share `src/lib/backup.ts` and both re-read the
   archive and re-parse every document before storing it. A dump that has never
   been verified is an assumption.

1. Atlas → cluster `atlas-teal-basket` → **Backup**: note the tier. On M0 this
   tab cannot be made to do anything; the fix is upgrading to M10+.
2. **Verify the dump actually restores** — an untested dump is not a backup.
   Restore it into a throwaway database, never over live:

   ```bash
   MONGODB_URL="mongodb://127.0.0.1:27017/restoretest?tlsAllowInvalidCertificates=true" \
     MONGODB_DB=aithoughts npm run db:restore -- backups/<file>.json.gz --drop --confirm=aithoughts
   ```

   (Start a disposable Mongo with `e2e/start-test-mongo.sh`.)

3. Capture a baseline from live, then verify the restore against it:

   ```bash
   # against live (read-only, safe):
   MONGODB_URL="$LIVE_URL" MONGODB_DB=aithoughts npm run drill:check -- --json > live.json

   # against the restored copy (read-only, safe):
   MONGODB_URL="$RESTORED_URL" MONGODB_DB=aithoughts \
     npm run drill:check -- --compare live.json
   ```

   This checks that all 22 app collections are present, that the critical
   indexes survived, that no post/reaction/report/profile points at a document
   that did not come back, and that every user still has a handle (a restore
   without handles locks everyone out of their own account). It prints the newest
   document timestamp, which is the real answer to "how much data would I lose".
   Exits non-zero on any failure. Posts whose `user_id` has no user doc are
   reported as a NOTE with the handles listed — `npm run seed` creates demo
   posts that do this by design, so it needs a human to judge.

   Then still open the app against the restored cluster to confirm the UI path:
   `MONGODB_URL=... MONGODB_DB=... npm run dev`, sign in, open a profile and the
   feed. The script proves the data; the browser proves the wiring. A restored
   Atlas cluster inherits the live IP allowlist — add your own IP first.

4. Record: dump path, restore duration, and the diff result. Delete any
   temporary cluster when done.

## Moderation promise

The Terms promise action on reports **within 24 hours** (App Store rule 1.2). Someone must check `/keeper` daily.

## Still host-owned (cannot be coded away)

- Atlas IP allowlist / private networking
- Backup restore drill (do once) — blocked while production is on the Free Plan; see drill section
- Who is on the keeper list
- Watching Resend + Vercel logs for spikes

## Known gaps found 2026-09-29

- **No managed backups.** `atlas-teal-basket` is Atlas Free (M0), which has no
  Cloud Backup at any setting. Only `npm run db:dump` covers this today, and
  nobody is scheduled to run it.
- **`mongodump` is unavailable.** Removed from Homebrew; MongoDB's own downloads
  return 403 here. `scripts/mongo-dump.mjs` is the substitute.
- **Production Atlas project is not in your own Atlas account.** The cluster was
  provisioned through Vercel's MongoDB integration, so `cloud.mongodb.com` shows
  only an unrelated "Project 0". You cannot enable managed backups or change the
  tier without access to that project — request an invite, or manage billing via
  Vercel.
- **No admin on production.** The `admins` and `site_settings` collections do
  not exist, so no `ADMIN_USER_IDS` is set and the bootstrap `curl` above has
  never been run. `/admin` is unusable.
- **Missing index.** `messages.messages_post_created` is absent on production
  (an older `messages.post_id_1_created_at_1` is there instead), so
  `ensureCoreIndexes` is not completing cleanly. Harmless at 1 message.
- **Backup job is unverified end-to-end in production.** It is unit-tested and
  the dump/restore round-trip was verified against live data, but the cron has
  never actually run on Vercel. Check it after the first scheduled run:
  `curl -sS https://YOUR_APP/api/cron/backup -H "Authorization: Bearer $CRON_SECRET"`.
  If it returns 502 about private access, `BLOB_READ_WRITE_TOKEN` is a public
  store token and the job will not upload — that is intentional.
- **A silent backup is worse than none.** Nobody is alerted if the cron stops
  running. Consider wiring a staleness check into `/api/health`.

