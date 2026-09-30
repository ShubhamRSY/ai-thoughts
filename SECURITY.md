# Host security checklist (AI·Thoughts)

App code hardens sessions, OTP, emails-at-rest, and account deletion. **You** still own Atlas, secrets, and who is a keeper.

## Secrets (Vercel / local)

- [ ] Set a strong `AUTH_SECRET` (32+ random bytes hex). Never commit `.env` / `.env.local`.
- [ ] Prefer the same secret forever once emails are encrypted — rotating `AUTH_SECRET` without a migration breaks decrypting `emailEnc` / looking up `emailHash` (unless you set a dedicated `EMAIL_ENCRYPTION_KEY` and keep that stable).
- [ ] Optional: `EMAIL_ENCRYPTION_KEY` — dedicated key for email hash/encrypt; if unset, falls back to `AUTH_SECRET`.
- [ ] `CRON_SECRET` on Vercel Cron + `Authorization: Bearer …` for digests.
- [ ] Seed only with secret: `POST /api/admin/seed` needs `Authorization: Bearer <ADMIN_SEED_SECRET|CRON_SECRET>`.
- [ ] Keep `RESEND_API_KEY` + verified `EMAIL_FROM` domain aligned.
- [ ] Optional: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — free tier at [upstash.com](https://upstash.com) makes rate limits shared across all serverless instances instead of per-instance in-memory. Unset = still protected, just per-instance.

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## MongoDB Atlas

- [ ] **Network access**: IP allowlist — prefer Vercel static egress / Atlas “add current IP” for ops, or VPC peering if you grow into it. Avoid `0.0.0.0/0` when you can.
- [ ] **DB user**: least privilege (read/write on `aithoughts` only — not Atlas admin).
- [ ] **Backups**: enable Cloud Backup / PITR on the cluster; test a restore once.
- [ ] Connection string only in server env (`MONGODB_URL`) — never `NEXT_PUBLIC_`.

Sensitive collections if Atlas is exposed: `users` (emailEnc), `user_prefs`, `push_subscriptions`, `auth_codes`, `reports`, `keepers`.

## Keepers / admin

- [ ] Set `ADMIN_USER_IDS` to your product-owner user id(s) on Vercel (shown on `/admin` when signed in without access).
- [ ] Grant keepers from `/admin`. Role rows reference the account (`user_id`), not the handle; a hand-inserted row without `user_id` grants nothing.
- [ ] Keepers alone can list/resolve reports and contact inbox APIs; `/keeper` is session-gated.
- [ ] Admins inherit keeper powers and can delete any take, seed the feed, and toggle maintenance.
- [ ] Do not put keeper/admin handles in public client config.

## Media (Vercel Blob)

Feed media uses **public URLs by design** (social playback). Treat takes as public content. Do not put private PII in clip audio/video.

## What the app already does

| Area | Behavior |
|------|----------|
| Sessions | httpOnly cookie, HMAC-signed; signature compare is timing-safe |
| OTP | HMAC’d codes; compare timing-safe; codes keyed by `emailHash`; IP + email + global rate limits |
| Email at rest | `emailHash` + AES-GCM `emailEnc` on users/prefs; plaintext migrated on login/digest |
| Account wipe | `DELETE /api/account` with `{ "confirm": "DELETE" }` + Profile UI |
| Account export | `GET /api/account` JSON download + Profile UI |
| Admin seed | Bearer secret required (timing-safe) |
| Cron | Bearer `CRON_SECRET` required in production (timing-safe) |
| Reports | Keeper session required |
| Health | `GET /api/health` checks env + Mongo ping + ensures indexes |
| Tests | `npm test` covers crypto, cron auth, rate limit, env gate |

## After deploy

1. Confirm production env has `AUTH_SECRET`, `MONGODB_URL`, Resend, Blob, VAPID, `CRON_SECRET`.
2. Hit `/api/health` until `ok: true`.
3. Sign in once (migrates your user email off plaintext).
4. Spot-check Atlas: new users should show `emailHash` / `emailEnc`, not raw `email`.
5. Follow [RUNBOOK.md](./RUNBOOK.md) smoke checklist.