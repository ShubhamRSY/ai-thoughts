# Ops runbook (must-do for live Voices)

## Global admin console (private)

Not linked from Voices. Bookmark:

`https://YOUR_APP/admin`

1. Set `ADMIN_HANDLES` on Vercel to your handle, e.g. `@yourname` (comma-separated for more).
2. Sign in on the site as that handle → open `/admin`.
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

1. Set `OWNER_DASHBOARD_SECRET` on Vercel (or reuse `CRON_SECRET`).
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
| Resend DNS for the sending domain | Resend → Domains → add `aito.social`, then copy its records (MX + SPF TXT on `send.aito.social`, DKIM TXT on `resend._domainkey.aito.social`) into the registrar. Add `_dmarc.aito.social` TXT `v=DMARC1; p=none; rua=mailto:keepers@aito.social`. Set `EMAIL_FROM="AI·Thoughts <hello@aito.social>"`. | As of 2026-09-28 none of these records exist — codes from `@aito.social` get refused or land in spam, and `onboarding@resend.dev` only reaches the Resend account owner. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile (free), hostname `www.aito.social` | CAPTCHA on "Send sign-in code". Without it a few IPs can drain the email cap and block every new sign-in. |
| `OTP_EMAILS_PER_HOUR` | Vercel env | Site-wide sign-in email cap (default 40). Size to the Resend plan. |
| `OPENAI_API_KEY` | platform.openai.com (moderation is free) | Screens take text, photos and avatars. Audio/video are not screened — keepers + reports cover them. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | upstash.com (free tier) | Rate limits shared across serverless instances; without it each instance counts separately. |
| Error alerts | Sentry (`npx @sentry/wizard -i nextjs`) or Vercel → Observability alerts on 5xx | Routes catch and log their own errors, so alerting must watch logs/5xx, not just crashes. |

After deploying, open `/api/health` once: it builds the new unique index on `users.handle` (checked 2026-09-28: 0 duplicates, so it builds cleanly).

**Before every release:** `npm test`, `npm run test:e2e`, and the live gate `npm run prelaunch` (see `scripts/prelaunch-check.mjs`) against a dev server on a throwaway DB.

**Local dev warning:** `.env.local`'s `MONGODB_URL` points at the Atlas cluster. Use a separate database (or `e2e/start-test-mongo.sh`) for local work and tests so nothing writes to live data.

## Backup restore drill (do once, ~20 min)

1. Atlas → cluster → **Backup**: confirm Cloud Backup is on and a snapshot exists.
2. **Restore** the latest snapshot to a *new* cluster (never the live one).
3. Point a local `npm run dev` at it (`MONGODB_URL`, `MONGODB_DB`), sign in, open a profile and the feed.
4. Write down how long the restore took (that's your recovery time) and the snapshot's age (that's how much data you'd lose). Delete the temporary cluster.

## Moderation promise

The Terms promise action on reports **within 24 hours** (App Store rule 1.2). Someone must check `/keeper` daily.

## Still host-owned (cannot be coded away)

- Atlas IP allowlist / private networking
- Backup restore drill (do once)
- Who is on the keeper list
- Watching Resend + Vercel logs for spikes
