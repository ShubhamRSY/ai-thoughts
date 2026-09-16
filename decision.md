# Decision log — AI·Thoughts / Voices

Log of decisions made while changing code in this work stream (soft-launch trust pack through UI stress-test fixes).  
Format: **Decision → Why → Alternatives considered → Libraries / stack**.

---

## Product / soft-launch

### Soft-open, not a big public launch
- **Decision:** Optimize for trust, anti-abuse, and first-session honesty before growth.
- **Why:** Empty/broken-feeling UI kills retention harder than low traffic. Owner asked for soft-launch readiness.
- **Alternatives:** Growth hacks, fake engagement numbers — rejected (fake +12 likes already removed earlier).
- **Stack:** Existing Next.js + MongoDB app; no new growth SDK.

---

## P0 — first-session killers

### Guest Share → sign-in, not cryptic error
- **Decision:** Gate `openShare` with auth; redirect to `/sign-in?next=/app` (and accept both `next` and `from` on SignInForm).
- **Why:** Guests hitting Share looked like a broken app.
- **Alternatives:** Inline auth modal — deferred to keep share flow simple.
- **Stack:** Next.js `useRouter`, existing OTP auth (`/api/auth/sign-in`, `/api/auth/verify`).

### Feed “Quiet for now” while loading
- **Decision:** `feedStatus: loading | ready | error` + FeedGrid `loading` UI (“Loading voices…”).
- **Why:** Empty state during fetch felt dead.
- **Alternatives:** Skeleton cards — skipped for speed; simple copy is enough for soft launch.
- **Stack:** Client state in `app/page.tsx`; `fetchPulsePosts` from `@/lib/db`.

### “Your feeling is live” but filters hide it
- **Decision:** On successful publish, force Worldwide + clear media/feeling filters + `focusPostId` + scroll into view; success CTA “See it in Voices”.
- **Why:** Success lied when “Near you” / filters hid the post.
- **Alternatives:** Keep current filter and toast “switch to Worldwide” — weaker; we switch for them.
- **Stack:** Existing publish path; no new lib.

### Like/react optimistic + rollback
- **Decision:** Optimistic UI in FeedCard; `onReact` returns `Promise<boolean>`; rollback + error text on failure.
- **Why:** Silent fail → like vanishes on refresh = trust killer.
- **Alternatives:** Wait for server before UI — feels laggy on mobile.
- **Stack:** `/api/posts/[id]/reactions`, `addReaction` in `db.ts`.

### Real publish errors
- **Decision:** Expand `PublishResult` with `blocked` / `auth` / `cooldown`; map API `code` / `retry_in_sec` / messages in SubmitModal.
- **Why:** Rate limit, AI-slop, upload failures all became “couldn’t share”.
- **Alternatives:** Generic toast only — rejected.
- **Stack:** Existing `jsonFetch` error enrichment; server `assertCanPost` in `anti-abuse.ts`.

---

## P1 — data / trust

### Reaction handle casing
- **Decision:** Normalize handles (`@Maya` / `maya` → one key); store `handle_norm`; unique sparse index on `(post_id, handle_norm, reaction)`.
- **Why:** Casing variants caused stuck/double likes.
- **Alternatives:** Case-sensitive only — breaks real users.
- **Stack:** MongoDB indexes via `ensureCoreIndexes`; no new ORM.

### Profile name vs session / posts
- **Decision:** Profile PUT updates `users.displayName`, refreshes session cookie, bulk-updates `posts.author`; client `auth.refresh()` after save; feed prefers live displayName from users map.
- **Why:** Local profile saved but posts/session kept old name.
- **Alternatives:** Only update new posts — leaves feed lying.
- **Stack:** JWT/session cookies in `auth.ts`; Mongo `updateMany`.

### Missing `createdAt` = old account (anti-abuse bypass)
- **Decision:** Fail-closed: missing/invalid `createdAt` → age `0` (brand-new limits).
- **Why:** Treating missing as “old” let spam bypass caps.
- **Alternatives:** Fail-open for UX — unsafe for soft launch.
- **Stack:** Pure helpers in `src/lib/anti-abuse.ts` (no new lib).

### Duplicate comments
- **Decision:** Optimistic local id; replace/dedupe when server id arrives; poll subscription skips local twins by handle+body.
- **Why:** Local id + poll showed the same reply twice.
- **Alternatives:** No optimistic UI — slower chat.
- **Stack:** Mongo messages API; client poll (no WebSocket/Socket.io — keep ops simple).

### Seed posts looked “Verified”
- **Decision:** Label seeds `Sample voice`, `integrity_verified: false`; migrate legacy seed rows on ensure/seed.
- **Why:** Fake trust badge on demo content.
- **Alternatives:** Delete all seeds — hurts empty-feed warmth for soft open.
- **Stack:** Existing seed catalog `GLOBAL_SEED_POSTS`.

### Activity / push don’t open the take
- **Decision:** Push/activity URLs `/app?post=<id>`; ActivityPanel `onSelectPost`; scroll + `forceChatOpen`.
- **Why:** Notifications were dead ends.
- **Alternatives:** Dedicated `/post/[id]` route — more work; query param reuses home.
- **Stack:** Existing `web-push` + `activity.ts` (already in project).

### “Today’s prompt” on old days
- **Decision:** Badge only when `thought.promptDay === todayKey()` (local); else “Prompt · MM-DD”.
- **Why:** Old prompt answers looked like today’s.
- **Stack:** `daily-prompt.ts`.

### `invitesOpen` did nothing
- **Decision:** Gate OTP sign-in and new-user verify; returning users can still finish OTP when invites closed.
- **Why:** Admin toggle wrote DB but auth ignored it.
- **Stack:** `getSiteSettings` / `setSiteSettings` in `admin.ts`.

### Midnight prompt day client vs UTC
- **Decision:** Client sends local `prompt_day`; server stores that; fallbacks use day-key-stable `dailyPromptForDay` / UTC helpers for server-only paths. Tests must not assume runner TZ.
- **Why:** Vercel UTC vs user local caused wrong buckets/badges.
- **Alternatives:** Force all UTC — worse for “today” UX.
- **Stack:** No date library; native `Date`.

---

## P2 — unfinished feel

### Mobile keyboard covers reply
- **Decision:** `visualViewport` pad on **composer** only; no autofocus on coarse pointers; scroll composer into view.
- **Why:** Autofocus + full-panel padding still covered input under nav/keyboard.
- **Alternatives:** Full-screen chat route — deferred.
- **Stack:** Browser Visual Viewport API (no extra lib).

### Offline PWA hard-fail
- **Decision:** Cache `offline.html`; navigate fallback to it; bump SW cache to `v7`.
- **Why:** Offline fetch → opaque error.
- **Alternatives:** Workbox — heavier; hand-rolled SW already present.
- **Stack:** Existing `public/sw.js` service worker.

### Placeholder video/audio copy
- **Decision:** User-facing “No video yet” / “Couldn’t play” / “Audio unavailable” — no `/public/media` developer copy.
- **Why:** Looked unfinished.
- **Stack:** Custom players (no video.js/hls.js — clips are short Blob URLs).

### Auto `#Future` on lazy posts
- **Decision:** Empty tags stay `[]` (already fixed in SubmitModal; keep it).
- **Why:** Forced tag felt spammy.
- **Stack:** N/A.

---

## UI simplifications (this session)

### Remove continent / “Near you”
- **Decision:** Default Worldwide; drop Americas/Europe/… chips and near ranking.
- **Why:** Owner: keep it global; let people express without regional chrome.
- **Alternatives:** Keep near as soft language sort — rejected as clutter.
- **Stack:** Removed client use of `rankByRegion` / `preferredLanguages` on home (helpers remain in `region.ts` unused by home).

### Remove home “I feel…” chips
- **Decision:** DailyCheckIn = prompt + single **Share your feeling** CTA.
- **Why:** Owner found the feeling chip row noisy; feeling still choosable in SubmitModal for labeling.
- **Stack:** Existing `FEELINGS` in share modal only.

### Remove “Download my data”
- **Decision:** Drop export block; keep Delete account.
- **Why:** Owner: don’t say download my data; keep delete as-is.
- **Stack:** `/api/account` GET export still exists server-side (unused in UI).

---

## Bugfixes / stress-test

### Report sheet under Install banner
- **Decision:** `createPortal` report dialog to `document.body` at `z-[80]`; scrollable reasons; Cancel; confirm only after API OK; lower PWA Install to `z-40`.
- **Why:** Same z-index as Install + bottom nav clipped reasons / blocked clicks.
- **Alternatives:** Dismiss install forever — still need correct stacking.
- **Stack:** React `createPortal` (built-in).

### Install banner covering Reply/Like
- **Decision:** `html[data-pwa-banner=1]` increases `.pb-nav` padding; install sets dataset when shown.
- **Why:** Feed actions sat under install + nav (click intercepted in browser test).
- **Stack:** CSS + small React effect; no layout library.

### Recording / Safari
- **Decision:** Try multiple MIME types (webm/mp4); `start(1000)` timeslice; empty-chunk error; secure-context check.
- **Why:** WebM-only + empty blob on short stop breaks iOS/Safari.
- **Alternatives:** RecordRTC / MediaSoup — overkill for ≤120s takes.
- **Stack:** Native `MediaRecorder` + `getUserMedia`.

### Video/audio players
- **Decision:** Hide play chrome on placeholder; reset state on `src` change; `playsInline` on video.
- **Why:** Dead play button on empty/failed media.
- **Stack:** Native `<video>` / `<audio>` (no player library).

### Share / Activity z-index
- **Decision:** SubmitModal `z-[90]`, ActivityPanel `z-[70]`.
- **Why:** Sheets competed with install/nav.
- **Stack:** Tailwind z-index utilities.

### Client slop check always `newAccount: true`
- **Decision:** Client `checkContentQuality(..., { newAccount: false })`; server still enforces age-aware rules.
- **Why:** Established users blocked client-side by “new account” heuristics.
- **Stack:** `anti-abuse.ts` heuristics (phrase lists — not an ML API).

### CI timezone-fragile test
- **Decision:** Assert UTC day absolutely; local day from host calendar; only assert local≠UTC when `getTimezoneOffset() !== 0`.
- **Why:** GitHub Actions is UTC; test assumed EDT local day.
- **Stack:** Node test runner (`node --test`).

---

## Libraries & stack (why these, not others)

| Choice | Why |
|--------|-----|
| **Next.js App Router** | Already the app; SSR/API routes colocated. |
| **MongoDB** | Existing persistence; flexible docs for posts/reactions/notifications. |
| **Native MediaRecorder** | Short takes; avoid RecordRTC weight. |
| **web-push** | Already wired for activity digests. |
| **@vercel/blob** | Already used for media/avatar uploads on Vercel. |
| **lucide-react** | Existing icon set. |
| **No Socket.io** | Poll every 3s for comments is enough at soft-launch scale. |
| **No date-fns/dayjs** | Prompt day keys are simple YYYY-MM-DD. |
| **Hand-rolled SW** | Already present; offline.html is a small add. |
| **Node built-in test** | Zero Jest config; matches `package.json` scripts. |

---

## Deploy

### Empty commit to redeploy
- **Decision:** When local `vercel` CLI unauthorized, push empty commit on `main` to trigger GitHub→Vercel.
- **Why:** Owner asked deploy; CLI returned “Not authorized”.
- **Alternatives:** `vercel login` interactive — not available in this agent session.

---

## Landing page (public launch cleanup)

### Remove feelings list + sample voices from `/`
- **Decision:** Drop “Feelings you can name” and “Voices already speaking” from `src/app/page.tsx`. Keep hero, CTA, and “What you do here”.
- **Why:** Owner asked to remove those blocks from the front end before public launch — less clutter, less seed-looking content on the first page.
- **Alternatives:** Keep samples for social proof — rejected; owner wants them gone.
- **Stack:** Landing stays a Server Component; still uses `getPulseStats()` for the people count only.

### Single CTA at bottom of landing
- **Decision:** Remove the top “Start expressing” button; keep one CTA under “What you do here” (with “Email code · no password” for guests).
- **Why:** Owner: don’t keep two Start expressing — only at the bottom.
- **Alternatives:** Top-only CTA — rejected.
- **Stack:** Same `Link` to `/sign-in` or `/app`.

### Brand name beside logo
- **Decision:** Put `AI·Thoughts` in a horizontal row next to the BrandMark tile on `/`.
- **Why:** Owner asked to keep the name beside the logo.
- **Alternatives:** Name stacked under logo — previous layout; rejected.
- **Stack:** Flex row on landing `h1`.

### Short name `AiTo`
- **Decision:** Add `BRAND.shortName = "AiTo"`; use it beside the logo on landing and in the app header. Keep full `AI·Thoughts` for footer, legal, emails, metadata.
- **Why:** Owner asked for a short name AiTo for compact brand chrome.
- **Alternatives:** Rename product entirely to AiTo — rejected; full name stays formal.
- **Stack:** `src/lib/brand.ts` single source.

### Install app → already logged in
- **Decision:** Only show the PWA install banner when the user is signed in; `/install` requires sign-in before showing Add to Home Screen steps. Session cookie (httpOnly, 90d, SameSite=Lax, path=/) carries into the installed same-origin PWA so `/app` opens without a new OTP.
- **Why:** Owner: if user downloads/installs the app, it should automatically be logged in.
- **Alternatives:** Deep-link install token in `start_url` — riskier; cookie reuse is the standard PWA approach.
- **Stack:** `useAuth` + existing `aithoughts.session`; moved `PWAInstall` inside `AuthProvider`.

### Proper iOS + Windows downloadable apps
- **Decision:** Keep Capacitor for **iOS** (existing `/ios`, rename display to AiTo). Add **Electron** shell in `/desktop` for **Windows** `.exe` installer loading the same live Vercel URL. Document build steps in `NATIVE.md`.
- **Why:** Owner wants real downloadable apps on iOS and Windows without rewriting the product in Swift/C#.
- **Alternatives:** Full native rewrite — too slow; Windows Store MSIX first — deferred until `.exe` works; Tauri — lighter but less familiar for this stack.
- **Stack:** Capacitor 8 (iOS) + Electron + electron-builder (Windows NSIS).

### Windows classic auto-update (not “just open the website”)
- **Decision:** Add `electron-updater` checking **GitHub Releases**. On new version: download in background → “Restart now” dialog → `quitAndInstall`. Publish with `npm run publish:win` + `GH_TOKEN`.
- **Why:** Owner rejected passive “site updates when you open the app”; wants real installer auto-update like normal desktop apps.
- **Alternatives:** Only live-URL content updates — rejected by owner; paid update servers — unnecessary while GitHub Releases is free.
- **Stack:** `electron-updater` + electron-builder `publish.provider = github` (`ShubhamRSY/ai-thoughts`).

### Custom domain branding
- **Decision:** Production brand domain is **`aito.social`** (bought on Namecheap). Wire Vercel Domains + Resend; set `NEXT_PUBLIC_SITE_URL=https://aito.social`. Native shells (Capacitor / Electron) default to that URL.
- **Why:** Owner purchased `aito.social` for public branding.
- **Alternatives:** Stay on `*.vercel.app` — weaker for email/trust.
- **Stack:** Namecheap DNS → Vercel + Resend custom domain.

---

*Last updated: 2026-09-16 (domain: aito.social).*
