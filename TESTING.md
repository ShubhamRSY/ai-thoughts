# Testing & QA

How this repo is tested, what's covered, what isn't, and exactly how to run
each layer. See `e2e/README.md` for Playwright-specific setup.

## Stack

| Layer | Tool | Location |
| --- | --- | --- |
| Unit | Node's built-in test runner (`node --test`, TypeScript via `--experimental-strip-types`) | `src/lib/*.test.ts` |
| E2E / browser | Playwright | `e2e/*.spec.ts` |
| API | Playwright `request` fixture (same runner as E2E) | `e2e/api-health.spec.ts` |
| CI | GitHub Actions | `.github/workflows/main.yml` |

There is no separate backend service — API routes are Next.js route handlers
under `src/app/api/**/route.ts`, not a standalone FastAPI/Express app, so
there's no OpenAPI/Swagger contract to test against as such.

## Inventory (at the start of this pass)

- **Unit tests**: 51 assertions across 4 files — crypto/hashing (`secure.ts`),
  cron-auth, anti-abuse (disposable email, dignity, slop scoring), trust
  labels, and privacy helpers. All passing.
- **Integration/API tests**: none.
- **E2E tests**: none.
- **Security tests**: none automated (a `SECURITY.md` policy doc exists, no
  scanning).
- **Performance tests**: none (no benchmarks).
- **CI**: `main.yml` runs lint + unit tests + build on push/PR to `main`.
  Two more workflows build native Windows installers on tag push — unrelated
  to test coverage.
- **Coverage tooling**: none configured (no nyc/c8/istanbul).
- **Failing tests at start**: none — `npm test` was green (51/51).

## What was added

9 new Playwright tests across 5 files, covering flows the unit tests
structurally cannot reach (they don't render pages or hit HTTP):

| Priority | Test | Protects against |
| --- | --- | --- |
| P0 | `landing.spec.ts` | Landing page failing to render or the primary CTA pointing at the wrong place — breaks every signed-out visitor's entry point |
| P0 | `auth.spec.ts` (happy path) | The email-OTP sign-in flow — the *only* way to get an account — breaking anywhere between request-code, verify, and session cookie issuance |
| P0 | `auth.spec.ts` (wrong code) | A regression that silently signs someone in on a bad code, or that stops surfacing the real error |
| P1 | `admin-gate.spec.ts` | A signed-out visitor being shown admin controls/data instead of a sign-in prompt (auth-bypass class regression) |
| P1 | `api-health.spec.ts` | `/api/health` — what uptime monitoring hits — reporting healthy when Mongo isn't actually reachable |
| P2 | `static-pages.spec.ts` (×4) | Privacy/Terms/Guidelines/Install pages 404ing or losing their heading after a routing/build change |

Deliberately **not** added: exhaustive coverage of every API route, every
feed/reaction/report interaction, media upload (needs a real
`BLOB_READ_WRITE_TOKEN`), or push notifications (needs VAPID + browser
permission prompts) — these need either a paid external service or
non-deterministic browser permission flows, and weren't asked for. See
"Remaining gaps" below if you want them prioritized next.

Existing unit tests were not modified.

### Bugs found and fixed while wiring this up (test-infra only, zero app code changed)

Getting from 0 to a passing suite surfaced two real, non-obvious issues —
worth recording since they'll bite anyone else running this app locally
against a non-Atlas MongoDB or via `127.0.0.1`:

1. **`src/lib/mongodb.ts` hard-codes `tls: true`.** Correct for production
   (Atlas requires TLS) — but it means a plain local/CI MongoDB container
   can't be used for testing as-is. Fixed on the test side, not the app: the
   test Mongo now runs with a throwaway self-signed cert
   (`--tlsMode requireTLS --tlsAllowConnectionsWithoutCertificates`), and the
   connection string adds `tlsAllowInvalidCertificates=true`. See
   `.github/workflows/e2e.yml` for the exact recipe.
2. **`next dev`'s `allowedDevOrigins` only trusts `localhost`, not
   `127.0.0.1`.** Hitting the app via `127.0.0.1` silently hangs any page
   using `useSearchParams()` (e.g. `/sign-in`) — the Suspense boundary never
   resolves, hydration never completes, and there's no console error at all,
   just an infinite loading state. `playwright.config.ts` now points at
   `localhost` for this reason (see its inline comment). Nothing in the app
   was changed — this is purely how the tests reach the dev server.
3. `admin-gate.spec.ts` initially asserted the wrong mechanism: `/admin`'s
   own `!user` branch (an inline "sign in with your admin account" render)
   is actually unreachable in normal use — `src/proxy.ts` (Next 16 renamed
   `middleware.ts` to `proxy.ts`; grepping for "middleware" won't find it)
   redirects unauthenticated requests to `/admin`, `/app`, and `/keeper` to
   `/sign-in` at the edge, before any page code runs. That's a *stronger*
   guarantee than what the test first assumed, so the test was corrected to
   assert the real (better) behavior instead of the app being changed.

Final state: **51/51 unit tests, 9/9 Playwright tests, all green** (E2E run
takes ~11–30s including MongoDB startup).

## Test priorities (for what to add next)

- **P0** — auth, landing, publishing a take, the feed rendering. Auth and
  landing are now covered by E2E; **publishing a take is not** (needs Blob
  storage — see gaps).
- **P1** — admin/keeper moderation actions, follow/report flows, `/api/health`.
  Admin gate and health are covered; keeper/report/follow flows are not.
- **P2** — static/legal pages, profile editing, translation. Static pages
  covered.
- **P3** — performance and security hardening (see the CodSpeed/42Crunch
  sections below — both evaluated, neither wired up, for reasons given).

## Remaining gaps (not implemented — flagging, not guessing at priority)

- Publishing a take (text/audio/video) end-to-end — blocked on needing a
  real `BLOB_READ_WRITE_TOKEN` for media, or a decision to stub Blob in tests.
- Follow / report / reaction flows — straightforward to add with the same
  patterns as `auth.spec.ts`, just not in this pass's scope.
- Push notification subscribe flow — needs VAPID keys and browser permission
  handling (`context.grantPermissions`), more setup than the P0/P1 items.
- API-level tests for the other ~25 route handlers (contact, posts, profile,
  etc.) beyond `/api/health` — same Playwright `request` fixture pattern
  extends to these; not added to avoid "hundreds of meaningless tests" per
  the brief. Add the ones behind real user actions as those actions get
  E2E-covered.

## Tools evaluated

### Playwright — installed & configured
Not previously present. Added `@playwright/test` (devDependency), Chromium
browser binary, `playwright.config.ts`, and `e2e/*.spec.ts`. Runs against
`next dev` with a real MongoDB (see `e2e/README.md`) — no in-memory/mocked DB
because auth, sessions, and pulse stats are all read from it on nearly every
page.

### Claude in Chrome — not something this environment can configure
This is a separate browser extension the user installs and authorizes
directly in their own Chrome, outside of Claude Code. There's nothing to
install or wire up from this repo/CLI session. If you have it enabled, it's
a way to *drive a real logged-in Chrome session interactively* — complementary
to Playwright's automated, headless/headed runs, not a replacement. Nothing
was changed here.

### TestSprite MCP — not configured; needs an account first
No existing TestSprite project or config found in this repo. TestSprite is a
real third-party SaaS test-generation service, not installed here. Before it
can be used you'd need to:
1. Create a TestSprite account and get an API key from their dashboard.
2. Add that key to this machine's MCP config (`claude mcp add testsprite ...`
   or via `/mcp`), which is an interactive step this session can't do for you.

Once that's done, the `testsprite-onboard` skill (already available in this
Claude Code install) can map the app and generate a starter suite. Not run
here because there's no key to configure it with, and installing without
your explicit go-ahead on an external paid service isn't appropriate to do
unattended.

### Superpowers — available, use going forward
The Superpowers plugin (including `test-driven-development`,
`systematic-debugging`, `verification-before-completion`) is already
installed in this Claude Code environment — nothing to configure. Going
forward, new features and real bug fixes in this repo should follow its
red→green→refactor TDD workflow (failing test → implementation → passing
test → refactor). This pass added tests for *existing* behavior (a
QA/coverage task), which isn't the same thing as TDD for new work — so it
wasn't invoked here, per the brief's own instruction not to retrofit TDD onto
existing code for its own sake.

### CodSpeed — skipped, no genuine bottleneck to benchmark
Checked the obvious candidates for CPU-bound hot paths: `dignity.ts` (80
lines), `anti-abuse.ts` (393 lines, mostly regex/set lookups), `pulse-stats.ts`
(82 lines), `integrity.ts` (52 lines). None do heavy computation — this app's
cost is I/O (MongoDB round-trips, Blob uploads), which CodSpeed's CPU-time
benchmarking doesn't meaningfully measure. Also: the CodSpeed MCP connector
in this environment requires OAuth authorization this non-interactive session
can't perform, and real value from CodSpeed additionally needs their GitHub
Action wired to an account on their service. (Git LFS, mentioned in the
original ask, is not actually a CodSpeed requirement — nothing here needed
it.) Revisit if a genuinely CPU-heavy feature shows up (e.g., client-side
media/transcript processing at scale).

### 42Crunch API security testing — skipped, no OpenAPI surface exists
This project is Next.js (App Router route handlers under `src/app/api/**`),
**not FastAPI** — there is no FastAPI app, no generated OpenAPI/Swagger
document anywhere in the repo (confirmed by grepping for `openapi`/`swagger`/
`fastapi`). 42Crunch audits an OpenAPI spec; there isn't one to audit yet.
Two ways to make this applicable, neither done in this pass:
1. Generate an OAS 3.0 spec from the existing 30 route handlers (the
   `generate-oas` skill in this Claude Code install can do this), then run
   `42crunch-audit` against it.
2. That still needs a 42Crunch account + API key (`42crunch-setup` skill) and
   the `42c-ast` binary before any audit/scan can run.
Given the size of (1) alone — mapping ~30 handwritten route handlers into an
accurate spec — and that (2) needs your credentials regardless, this was left
as a flagged next step rather than half-done here. Happy to generate the OAS
spec in a follow-up if you want it, independent of whether you set up
42Crunch itself.

### Test Writer/Fixer — skipped, not a verifiable/available tool here
This name doesn't correspond to any plugin or skill actually available in
this Claude Code installation (checked the skills list and Claude Code
plugin surface) — only a plugin directory listing would claim it exists, and
per the brief's own instruction not to install an unverified third-party
plugin just because it's listed somewhere. Its stated purpose (write tests,
fix failing ones) is already covered by Playwright (writing/running E2E),
Superpowers' TDD skill (writing tests before implementation), and the
existing `node --test` unit suite (fixing failing unit tests) — so even if
it were available, it would duplicate rather than add capability.

## Commands

```bash
# Unit tests (crypto, anti-abuse, trust, privacy — no server needed)
npm test

# API tests (currently: /api/health, via Playwright's request fixture)
npm run test:e2e -- api-health.spec.ts

# Playwright E2E (needs MongoDB — see e2e/README.md)
./e2e/start-test-mongo.sh
npm run test:e2e            # headless
npm run test:e2e:headed     # visible browser
docker rm -f aito-e2e-mongo

# Security tests
# None automated yet. `npm audit` covers dependency CVEs:
npm audit
# API contract security (42Crunch) needs an OAS spec + 42Crunch account first — see above.

# Performance tests
# None — see CodSpeed section above for why.

# Full regression suite (everything currently automated)
npm run lint && npm test && npm run test:e2e && npm run build
```

## CI

`.github/workflows/main.yml` (existing, unmodified) runs lint + unit tests +
build on every push/PR to `main`.

`.github/workflows/e2e.yml` (added) runs the Playwright suite on the same
triggers, using a `mongo:7` GitHub Actions service container so it needs no
external database or secrets. It's a separate workflow (not merged into
`main.yml`) so a flaky/slow E2E run can't block the existing fast
lint+build+unit gate, and so it's trivial to remove if you'd rather run E2E
some other way.
