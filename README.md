# AI·Thoughts — The Public Pulse

**How people really feel about AI — told in their own voice.**

A mobile-first PWA where adults (18+) share voice, video, and text takes about how AI makes them feel, right now. Built around feelings (not just opinions): every take opens with *"Right now, AI makes me feel…"*, and the feed surfaces the live mood of the pulse — the dominant feeling, per-feeling "rooms", and a safety-first space to speak honestly.

Live: [https://aito.social](https://aito.social) (also on Vercel until DNS is live)

---

## The idea

Most discussions about AI are loud and technical. This is the opposite:

- **Feelings-first** — you pick how you feel *before* you say anything.
- **Any language, no expertise needed** — it's not a tech forum, it's a human pulse. Adults 18+ only (confirmed at sign-up).
- **Honesty is safe here** — *"It's okay to feel bad about AI too."*
- **Verified sign-in** — email one-time codes (no passwords). Reading takes requires signing in.

---

## Features

### Pulse, not another feed
- Live dominant-mood headline, per-feeling mood wave, voice counts
- Daily pulse episode digest
- Feeling rooms, reactions, report/flag flow

### Feelings-first share
- Pick a feeling → record video/audio or write text
- SHA-256 integrity fingerprint on recorded clips

### Safety & moderation
- Keeper desk (`/keeper`) for open reports
- Contact / privacy requests (`/contact`)
- Rate limits on auth, contact, and publishing paths

### PWA
- Installable (manifest + service worker), mobile-first shell

---

## Tech stack

| Layer | Tool |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | MongoDB + Next.js API routes |
| Media | Vercel Blob |
| Auth | Email OTP via Resend + signed HTTP-only cookies |
| Icons | lucide-react |
| Native shell | Capacitor (loads production URL) |

---

## Getting started

```bash
npm install
cp .env.local.example .env.local
# fill MONGODB_URL, AUTH_SECRET, etc.
npm run seed   # optional demo takes
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required env (production)

| Variable | Purpose |
| --- | --- |
| `MONGODB_URL` | MongoDB connection string |
| `MONGODB_DB` | Database name (`aithoughts`) |
| `AUTH_SECRET` | Signs sessions + OTP hashes |
| `RESEND_API_KEY` | Sends sign-in codes (required in production) |
| `EMAIL_FROM` | Verified Resend sender |
| `BLOB_READ_WRITE_TOKEN` | Media uploads |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for OG/sitemap/emails |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Public privacy/contact address |

Without `RESEND_API_KEY` in **development**, the OTP is logged to the server console and shown in the sign-in UI so you can test locally.

### Going live on Vercel

1. Set all production env vars in the Vercel project (including `RESEND_API_KEY`).
2. Verify a sending domain in Resend (or use `onboarding@resend.dev` for early tests to your own inbox only).
3. Deploy `main` — CI runs lint + build on push/PR.
4. Confirm `/robots.txt`, `/sitemap.xml`, and email OTP sign-in work on the live URL.

---

## Project layout

```
src/
  app/            pages + API routes (auth, posts, contact, …)
  components/     Feed, Pulse, Player, Submit, Header, Footer, …
  hooks/          useAuth, useMediaRecorder, useFeelingStreak, …
  lib/            mongodb, auth, otp, email, site, db helpers
public/           icons, sample media, service worker
scripts/          seed-mongo.mjs
```

---

## Roadmap

- [x] Daily pulse episode digest
- [x] Daily feeling streak / return loop
- [x] Keeper moderation desk
- [x] Verified email OTP sign-in
- [ ] Feeling-based discovery by language/country
- [ ] Follow authors + reply notifications
- [ ] Translation of takes with captions/voiceover

---

Made to be kind. *All feelings. It's okay to feel bad about AI too.*
