# E2E tests (Playwright)

Critical user flows only — not exhaustive UI coverage. See `../TESTING.md` for
the full test inventory and strategy.

## Requirements

These tests hit real API routes, which need a reachable MongoDB (auth
sessions, pulse stats on the landing page, etc. all read from it). Start a
disposable one before running:

```bash
./e2e/start-test-mongo.sh
```

This isn't a plain `docker run mongo:7` — `src/lib/mongodb.ts` hard-codes
`tls: true` (correct for production Atlas), so the test Mongo needs a
throwaway TLS certificate too, or every connection attempt fails with
`Client network socket disconnected before secure TLS connection was
established`. See `TESTING.md` for the full story. Stop it afterwards with
`docker rm -f aito-e2e-mongo`.

No `RESEND_API_KEY` is needed — in development the sign-in API returns the
OTP code directly in the response (`devCode`) and the UI displays it, so the
full sign-in flow is testable without sending real email.

## Running

```bash
npm run test:e2e          # headless, starts `next dev` for you
npm run test:e2e:headed   # same, with a visible browser
```

`playwright.config.ts` starts `next dev` automatically, pointed at the
Mongo `start-test-mongo.sh` starts, and waits for it to respond. Override
`MONGODB_URL` / `AUTH_SECRET` / `CRON_SECRET` env vars if you need something
different, or set `E2E_BASE_URL` to run against an already-running server
instead.

Cross-engine smoke coverage is opt-in: `E2E_CROSS=1 npm run test:e2e` adds
Firefox and WebKit projects (`npx playwright install firefox webkit` first).
It's gated because a full 3-browser run is slow with the shared in-memory
rate limiter; `e2e/feed-retry.spec.ts` is skipped on WebKit while its route
interception stays flaky there (see the note in that spec).

## Design notes

- Selectors use roles/labels/visible text (`getByRole`, `getByLabel`), not CSS
  classes, so unrelated styling changes won't break tests.
- Tests generate a unique `@example.com` address per run instead of a fixed
  one, so re-runs don't collide with the per-email OTP rate limit
  (5 codes / hour — see `src/app/api/auth/sign-in/route.ts`).
- `workers: 1` / `fullyParallel: false` because the dev server's rate limiter
  and OTP store are in-process, in-memory state shared across tests.

## CSP against a production build

The page CSP (per-request nonce, `src/proxy.ts`) differs between `next dev`
and a production build, so check `e2e/csp.spec.ts` against a build before
changing it. `next build`/`next start` also load `.env.local`, so blank every
real credential first:

```bash
export AUTH_SECRET=e2e-test-secret-not-for-prod CRON_SECRET=e2e-test-cron-secret \
  MONGODB_URL="mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true" \
  MONGODB_DB=aithoughts-e2e TRUSTED_PROXY_HOPS=1 \
  BLOB_READ_WRITE_TOKEN= BLOB_PRIVATE_READ_WRITE_TOKEN= VERCEL_OIDC_TOKEN= RESEND_API_KEY= \
  OPENAI_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= KV_REST_API_URL= \
  KV_REST_API_TOKEN= SENTRY_AUTH_TOKEN= NEXT_PUBLIC_SENTRY_DSN=
npm run build && npx next start -p 3100 &
E2E_BASE_URL=http://localhost:3100 E2E_DB_NAME=aithoughts-e2e npx playwright test e2e/csp.spec.ts
```
