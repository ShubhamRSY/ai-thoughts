# AiTo native apps (iOS + Windows)

Same live site as the web app (`https://aito.social`) wrapped in native shells.

| Platform | Shell | Output | How users get it |
|----------|--------|--------|------------------|
| **iOS** | Capacitor (already in `/ios`) | `.ipa` / TestFlight / App Store | Apple Developer account required |
| **Windows** | Electron (`/desktop`) | `AiTo-Setup-x.x.x.exe` | GitHub Releases + **auto-update** |
| Android | Capacitor (`/android`) | `.apk` / Play Store | Optional — already scaffolded |

---

## Windows auto-update (what you asked for)

Installed apps use **`electron-updater`**:

1. You bump `desktop/package.json` `"version"` (e.g. `0.1.0` → `0.1.1`)
2. You publish a new GitHub Release with the built installer
3. Users’ AiTo checks GitHub on launch (and every 6 hours)
4. New version downloads in the background
5. Dialog: **Restart now** → installs and relaunches

Users do **not** manually re-download from the website.

### Publish a new Windows version

```bash
cd desktop
# 1) bump "version" in package.json
npm install
# 2) needs a GitHub token with repo release permission:
#    export GH_TOKEN=ghp_...
npm run publish:win
```

That builds `AiTo-Setup-x.x.x.exe` and uploads it to a GitHub Release on `ShubhamRSY/ai-thoughts`.

First-time users still download once from the Release page (or your `/install` link).

> Building Windows from macOS often works; if not, use a Windows PC or GitHub Actions (`windows-latest`).

### Local try (no auto-update)

```bash
cd desktop
npm install
npm start   # auto-update is disabled in unpackaged mode
```

---

## iOS — ship a real App Store / TestFlight app

You already have `/ios` via Capacitor. Requirements:

1. **Apple Developer Program** ($99/year) — [developer.apple.com](https://developer.apple.com)
2. Mac with **Xcode** installed
3. From repo root:

```bash
npx cap sync ios
npx cap open ios
```

4. In Xcode:
   - Set Team + signing
   - Bundle ID: `com.aithoughts.app` (must match App Store Connect)
   - Display name: **AiTo**
   - Archive → Distribute → **TestFlight** (friends) or **App Store**

Camera + mic permission strings are already in `Info.plist`.  
**iOS updates** after App Store: users update via the App Store (Apple’s auto-update), or you push TestFlight builds.

---

## Why this approach

- One UI (Next.js on Vercel)
- Capacitor = iPhone app
- Electron + `electron-updater` = Windows app that **self-updates** from GitHub Releases ($0)

---

## Checklist

- [ ] First Windows build + GitHub Release `v0.1.0`
- [ ] Link that `.exe` from `/install`
- [ ] Set `GH_TOKEN` for `npm run publish:win`
- [ ] Later: bump version → `publish:win` → users auto-update
- [ ] Optional: Apple App Store for iPhone
