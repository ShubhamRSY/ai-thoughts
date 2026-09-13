# Ops runbook (must-do for live Voices)

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

## Still host-owned (cannot be coded away)

- Atlas IP allowlist / private networking
- Backup restore drill (do once)
- Who is on the keeper list
- Watching Resend + Vercel logs for spikes
