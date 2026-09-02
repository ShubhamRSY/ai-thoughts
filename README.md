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
- **`FeelWith`** carousel — tap a feeling to *find your people*.
- **`FeelingRoom`** — a focused room per feeling with a "share in this room" CTA that pre-selects the feeling.

### 🎙️ Feelings-first share
- Full-screen share modal: pick a feeling → record **video/audio** or write **text**.
- Real `MediaRecorder` capture with playback, re-record, and friendly error states.
- Handle, display name, language, and tags on every take.

### 🔒 Real integrity
- Recorded clips are fingerprinted with an actual **SHA-256** of the clip bytes (`crypto.subtle.digest`) at capture time, stored per post and shown on the card ("Capture chip · unmodified").

### 🛡️ Built for all ages
- Report/flag flow on every take (hate, unsafe, spam, harm) routed to a `reports` table for community keepers.
- Welcoming, all-ages copy throughout.

### 📱 PWA, mobile-first
- Installable (manifest + service worker), centered 430px phone shell, IG-style bottom nav, safe-area aware.

### 🗄️ Live backend (optional)
- Zero-setup demo mode on fixtures when Supabase isn't configured.
- When configured: real accounts (magic-link sign-in), posts, reactions, profiles, and public Storage clips — all read/write live.

---

## Tech stack

| Layer | Tool |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (Postgres, Auth, Storage) |
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

### Going live with Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the environment template:

   ```bash
   cp .env.local.example .env.local
   ```

3. Fill in your values:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your publishable anon key>
   ```

4. Run the schema in the **Supabase SQL editor**:
   - `supabase/schema.sql` — tables (`profiles`, `posts`, `post_reactions`, `reports`) + RLS.
   - `supabase/storage.sql` — the public `takes` Storage bucket policies (upload/read for everyone).

> **Security note:** only the *publishable* anon key goes into the app (via env). Never expose your `service_role`/secret key — it's for admin tasks only (and never committed to git).

### That's it

With env vars set, empty database → app still runs on demo fixtures. First posted take → the pulse goes live with real voices.

---

## Project layout

```
src/
  app/            page (Pulse home), layout, manifest
  components/
    Feed/         FeedCard, FeedGrid, FilterBar, TranscriptPanel
    Player/       AudioPlayer, VideoPlayer
    Pulse/        PulseOverview, FeelWith, FeelingRoom
    Submit/       SubmitModal, MediaRecorderView, TextForm
    Header.tsx, MobileNav.tsx, ProfileView.tsx, IntegrityBadge.tsx
  hooks/          useMediaRecorder, useLocalProfile
  lib/
    supabase/     client, config, feed (fetch/publish/storage/auth/report)
    feelings.ts   the 7 feelings model
    integrity.ts  real SHA-256 digest + display helpers
    mock-data.ts  demo takes (used when offline/first load)
    types.ts      shared domain types
supabase/
  schema.sql      tables + RLS (posts, profiles, reactions, reports)
  storage.sql     public "takes" bucket policies
```

---

## Roadmap

- [ ] Feeling-based discovery ("people feeling X near you" by language/country)
- [ ] Follow authors + notification for room replies
- [ ] Moderation dashboard for community keepers (reads `reports`)
- [ ] "Tonight's episode of the pulse" — a periodic digest/show
- [ ] Translation of takes with captions/voiceover

---

Made to be kind. *All ages. All feelings. It's okay to feel bad about AI too.* 💜