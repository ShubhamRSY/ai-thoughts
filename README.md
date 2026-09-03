# AI·Thoughts — The Public Pulse

**How people really feel about AI — told in their own voice.**

A mobile-first PWA where people of all ages share voice, video, and text takes about how AI makes them feel, right now. Built around feelings (not just opinions): every take opens with *"Right now, AI makes me feel…"*, and the feed surfaces the live mood of the pulse — the dominant feeling, per-feeling "rooms", and a safety-first, all-ages space to speak honestly.

---

## The idea

Most discussions about AI are loud, technical, and adult. This is the opposite:

- **Feelings-first** — you pick how you feel *before* you say anything.
- **All ages, all languages** — it's not a tech forum, it's a human pulse.
- **Honesty is safe here** — *"It's okay to feel bad about AI too."*
- **Raw, public, open** — anyone can drop a take; signing in is optional.

The home screen is a **live mood reading**: a wave of feelings sized by how many voices share them, with room-level feeds, reactions, and a report/flag flow to keep the space kind.

---

## Features

### 🫀 A differentiated Pulse, not another feed
- **`PulseOverview`** — live dominant-mood headline ("Most hearts feel *worried*"), per-feeling mood wave, and voice counts.
- **`PulseEpisode`** — an auto-generated daily digest: *"The pulse felt __ today"*, languages spoken, top echoed take, a "% alive" meter, and featured voices → the day's story, not just a timeline.
- **`FeelWith`** carousel — tap a feeling to *find your people*.
- **`FeelingRoom`** — a focused room per feeling with a "share in this room" CTA that pre-selects the feeling.
- **"You're not alone"** — every take shows how many other people feel the same way, one tap from the room.

### 🎙️ Feelings-first share
- Full-screen share modal: pick a feeling → record **video/audio** or write **text**.
- Real `MediaRecorder` capture with playback, re-record, and friendly error states.
- Handle, display name, language, and tags on every take.

### 🔒 Real integrity
- Recorded clips are fingerprinted with an actual **SHA-256** of the clip bytes (`crypto.subtle.digest`) at capture time, stored per post and shown on the card ("Capture chip · unmodified").

### 🛡️ Built for all ages
- Report/flag flow on every take (hate, unsafe, spam, harm) routed to a `reports` table for community keepers.
- Welcoming, all-ages copy throughout.

### 🔒 Safety & moderation (launch-ready)
- **15-second publish cooldown** — browser-side guard prevents rapid spam (app-side, no login needed).
- **Content length cap** (2800 chars) + empty-content rejection surfaced to users.
- **Keeper moderation desk** (`/keeper`) — invite-only; lists open reports with reason + snippet, "Remove take" deletes the post and resolves the report, "Keep & resolve" dismisses without deleting.
- **Stored by handle** — keepers are users whose handle is added to the `keepers` collection; reports are open by default.
- **Seed data** (`scripts/seed-mongo.mjs`) — one-shot script (`npm run seed`) creates indexes + inserts demo takes so the pulse is never empty on first launch.

### 📄 Legal pages (no sign-up friction)
- `/terms` — Terms of Use (public posting, all-ages rules, keeper moderation rights).
- `/privacy` — Privacy (what's collected, what's public, media handling, kids & all ages, rights).
- `/guidelines` — Community Guidelines (the one rule, what gets removed, how to report).
- Footer with links on every home page + discreet `/keeper` link for community keepers.

### 📱 PWA, mobile-first
- Installable (manifest + service worker), centered 430px phone shell, IG-style bottom nav, safe-area aware.

### 🔥 Daily feeling streak
- Posting a take keeps your **pulse streak** alive (localStorage-backed, no backend needed). The You tab shows "N days on the pulse", today's mood chip, and a "check in today" nudge — a gentle reason to return tomorrow.

### 🗄️ Live backend (optional)
- Zero-setup demo mode on fixtures when MongoDB isn't configured.
- When configured: posts, reactions, comments, profiles, reports, keepers, and media (GridFS) — all read/write live.

---

## Tech stack

| Layer | Tool |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | MongoDB (via Mongoose-free official `mongodb` driver + Next.js API routes) |
| Media | GridFS (audio/video stored in MongoDB) |
| Icons | lucide-react |
| PWA | Web app manifest + service worker |

---

## Getting started

```bash
# 1. Install
npm install

# 2. Run (demo mode — no backend needed)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without configuration the app runs entirely on demo data with fake camera/audio support in the share flow, so you can experience the full product immediately.

### Going live with MongoDB

1. Create a free MongoDB cluster at [mongodb.com](https://www.mongodb.com/cloud/atlas) (or use a local instance).
2. Copy the environment template:

   ```bash
   cp .env.local.example .env.local
   ```

3. Fill in your connection string (a **server-side** secret — never `NEXT_PUBLIC_`):

   ```env
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB=aithoughts
   ```

4. Seed collections + initial demo takes and create indexes:

   ```bash
   npm run seed
   ```

5. Restart the dev server. The pulse now reads/writes real posts, reactions, and comments from MongoDB; media is stored in GridFS.

> **Security note:** `MONGODB_URI` is used only by server-side API routes — never expose it to the browser. The API routes live under `src/app/api/`.

### That's it

With env vars set, an empty database → app still runs on demo fixtures. First posted take → the pulse goes live with real voices.

---

## Project layout

```
src/
  app/            page.tsx (Pulse home), layout, manifest, terms/, privacy/, guidelines/, keeper/
  components/
    Feed/         FeedCard, FeedGrid, FilterBar, TranscriptPanel
    Player/       AudioPlayer, VideoPlayer
    Pulse/        PulseOverview, FeelWith, FeelingRoom, PulseEpisode
    Submit/       SubmitModal, MediaRecorderView, TextForm
    Header.tsx, MobileNav.tsx, Footer.tsx, ProfileView.tsx, IntegrityBadge.tsx, StreakCard.tsx, PWAInstall.tsx, PwaRegister.tsx
  hooks/          useMediaRecorder, useLocalProfile, useFeelingStreak
  lib/
    supabase/     client, config, feed (fetch/publish/storage/auth/report/keeper)
    feelings.ts   the 7 feelings model
    integrity.ts  real SHA-256 digest + display helpers
    mock-data.ts  demo takes (used when offline/first load)
    types.ts      shared domain types
supabase/
  schema.sql      tables + RLS + keepers + is_keeper() function
  storage.sql     public "takes" bucket policies
  seed.sql        one-shot demo voices (run once after schema)
```

---

## Roadmap

- [x] "Tonight's episode of the pulse" — auto-generated daily digest
- [x] Daily feeling streak / return loop
- [ ] Feeling-based discovery ("people feeling X near you" by language/country)
- [ ] Follow authors + notification for room replies
- [ ] Moderation dashboard for community keepers (reads `reports`)
- [ ] Translation of takes with captions/voiceover

---

Made to be kind. *All ages. All feelings. It's okay to feel bad about AI too.* 💜