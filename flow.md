# Execution flow — AI·Thoughts / Voices

How a request travels through this codebase, what calls what, and what this AI session changed.

---

## 1. Entry points

### Browser / PWA

| Entry | File | Role |
|-------|------|------|
| Root layout | `src/app/layout.tsx` | Fonts, `AuthProvider`, `PwaRegister`, `PWAInstall`, `ViewportSync`, global CSS |
| Landing | `src/app/page.tsx` | Marketing / CTA → `/app` or `/sign-in` |
| Main app shell | `src/app/app/page.tsx` | **Primary product UI** (feed, share, profile, activity) |
| Sign-in | `src/app/sign-in/page.tsx` → `SignInForm` | OTP email auth |
| Admin | `src/app/admin/page.tsx` | Product controls (`invitesOpen`, maintenance, seed) |
| Owner / Keeper | `src/app/owner/page.tsx`, `src/app/keeper/page.tsx` | Metrics / moderation |
| Service worker | `public/sw.js` | Offline shell + push click → `/app?post=…` |

### HTTP API (App Router route handlers)

Under `src/app/api/`:

- Auth: `auth/sign-in`, `auth/verify`, `auth/me`, `auth/sign-out`
- Content: `posts`, `posts/[id]`, `posts/[id]/reactions`, `posts/[id]/messages`, `posts/[id]/report`
- Social: `activity`, `follows`, `profile`, `account`, `prefs`, `push/*`
- Site: `site`, `admin/*`, `upload`, `health`, crons

---

## 2. Boot / execution order (open `/app`)

```
Browser GET /app
  → Next.js serves app/app/page.tsx (Client Component)
  → Root layout already wrapped children in AuthProvider
  → Home() mounts
       1. useAuth() → GET /api/auth/me (session cookie)
       2. useLocalProfile() → localStorage profile
       3. useSiteFlags() → GET /api/site (maintenance, invitesOpen)
       4. useEffect fetchPulsePosts() → GET /api/posts
            → Mongo posts + reactions + reply counts
            → setThoughts / feedStatus = ready
       5. If ?post=id → focusPostId, scroll, open chat on that card
       6. useActivity(user) → poll GET /api/activity
  → Render: MaintenanceBanner → Header → DailyCheckIn → FilterBar
            → FeedGrid → FeedCard(s) → MobileNav → ActivityPanel / SubmitModal
```

PWA: `PwaRegister` registers `sw.js`. Install banner may set `html[data-pwa-banner=1]` for extra bottom padding.

---

## 3. Core call graphs

### A. Share a feeling

```
User taps Share / DailyCheckIn CTA
  → openShare()
       if !user → router.push("/sign-in?next=/app")
       else → SubmitModal open
  → User records (optional) MediaRecorderView
       → useMediaRecorder.start()
            → getUserMedia → MediaRecorder → blob + previewUrl
       → onCaptured → setCaptured in SubmitModal
  → submit()
       → checkDignity / checkContentQuality (client)
       → onPublish = publish() in app/page.tsx
            → checkPublishGuard (local cooldown)
            → publishPost(payload, blob) in lib/db.ts
                 → optional @vercel/blob upload via /api/upload
                 → POST /api/posts
                      → getSession
                      → assertCanPost (anti-abuse.ts)
                      → insert posts doc
                      → notifyFollowersOfPost (activity.ts → optional web-push)
            → on success: setThoughts, setFocusPostId, regionScope=world
```

### B. Like / react

```
FeedCard.like() / react()
  → optimistic UI update
  → onReact → addReaction → POST /api/posts/[id]/reactions
       → normalize handle variants
       → toggle reaction row
       → notifyPostOwner (push/activity)
  → if false → rollback UI
```

### C. Reply / chat

```
FeedCard → setChatOpen(true) → ChatPanel
  → fetchMessages → GET /api/posts/[id]/messages
  → subscribeToMessages (poll 3s) → fetchMessages again
  → handleSend
       → optimistic local message
       → sendMessage → POST /api/posts/[id]/messages
            → checkDignity
            → insert message
            → notifyPostOwner / notifyMentions
       → replace local id with server id (dedupe)
```

### D. Report

```
FeedCard menu → Report
  → createPortal dialog (z-80)
  → submitReport → onReport → reportPost
       → POST /api/posts/[id]/report
  → success UI only if API returns ok
```

### E. Sign-in

```
SignInForm.requestCode → POST /api/auth/sign-in
  → invitesOpen check
  → rate limit → OTP email (Resend)
SignInForm.verifyCode → POST /api/auth/verify
  → invitesOpen: block brand-new users only
  → findOrCreateUser → set session cookie
  → router.replace(next|from|/app)
```

### F. Profile save / delete

```
ProfileView.commit → saveProfile → PUT /api/profile
  → profiles + users.displayName + posts.author + new session
  → auth.refresh()
ProfileView delete → DELETE /api/account → signOut → /
```

---

## 4. What calls what (home screen map)

```
app/app/page.tsx (Home)
├── Header → openShare
├── DailyCheckIn → openShare(text, fromDaily)
├── MissedYesterday → circle / share
├── FilterBar → regionScope world|today|circle, media filter
├── FeedGrid
│   └── FeedCard
│       ├── VideoPlayer / AudioPlayer
│       ├── ChatPanel → lib/db sendMessage/fetchMessages
│       ├── IntegrityBadge
│       └── Report portal → reportPost
├── FeelingRoom (optional) → FeedCard again
├── ProfileView (tab you)
├── SubmitModal → MediaRecorderView → useMediaRecorder
├── ActivityPanel → onSelectPost → focusPostId
└── MobileNav
```

Server-side helpers commonly used by APIs:

```
route.ts
  → lib/auth (session)
  → lib/mongodb
  → lib/anti-abuse (assertCanPost, fingerprints)
  → lib/activity (notifications + push)
  → lib/admin (site settings, admins)
  → lib/dignity (text filter)
```

---

## 5. Data flow (simplified)

```
Client UI  ←→  lib/db.ts (jsonFetch)  ←→  /api/*  ←→  MongoDB
                                      ↘  Vercel Blob (media/avatars)
                                      ↘  Resend (OTP)
                                      ↘  web-push (activity)
```

---

## 6. What this AI session changed

Scope: commits from **soft-launch trust pack** through **media/chat harden**  
(`f8fd89a` … `7737f90`, plus redeploy `55a2f6e`).

### New files
| File | Purpose |
|------|---------|
| `src/lib/anti-abuse.ts` | Age fail-closed, slop/dupe/handle/email heuristics, `assertCanPost` |
| `src/lib/anti-abuse.test.ts` | Unit tests for anti-abuse |
| `src/lib/trust.test.ts` | P0–P2 trust/regression tests |
| `public/offline.html` | Offline PWA fallback page |
| `decision.md` / `flow.md` | This documentation |

### Heavily modified (product paths)
| Area | Files |
|------|--------|
| Home orchestration | `src/app/app/page.tsx` |
| Feed UI | `FeedCard.tsx`, `FeedGrid.tsx`, `FilterBar.tsx`, `DailyCheckIn.tsx` |
| Share | `SubmitModal.tsx`, `useMediaRecorder.ts` |
| Chat | `ChatPanel.tsx` |
| Players | `VideoPlayer.tsx`, `AudioPlayer.tsx` |
| Profile | `ProfileView.tsx` (removed download-data UI) |
| Auth | `sign-in/route.ts`, `verify/route.ts`, `me/route.ts`, `SignInForm.tsx` |
| Posts API | `posts/route.ts`, `reactions`, `messages`, `report` |
| Profile API | `profile/route.ts` |
| Activity / SW | `activity.ts`, `ActivityPanel.tsx`, `public/sw.js` |
| Prompt day | `daily-prompt.ts` |
| Chrome | `PWAInstall.tsx`, `globals.css`, `brand.ts` |
| Seeds / admin | `admin/seed`, `admin/controls`, posts `ensureSamplePosts` |

### Intentionally removed / simplified behavior
- Continent chips + “Near you” ranking on home  
- Home “I feel…” feeling chip row  
- Profile “Download my data” block  
- Fake “Verified” labeling on seed posts  

### Not rewritten this session
- Landing marketing page structure  
- Owner metrics deep implementation  
- Capacitor native shells  
- Mongo connection layer (`lib/mongodb.ts`) itself  

---

## 7. Mental model (one sentence)

**Next.js client shell at `/app` talks to route handlers that enforce auth + anti-abuse, persist in Mongo, and fan out activity/push; this session made that loop honest under load, filters, offline, media, and chat chrome.**

---

*Companion: see `decision.md` for why each change was chosen.*
