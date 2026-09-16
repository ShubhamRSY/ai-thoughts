# AiTo native apps (iOS + Windows)

Same live site as the web app (`https://aito.social`) wrapped in native shells.

| Platform | Shell | Output | How users get it |
|----------|--------|--------|------------------|
| **iOS** | Capacitor (already in `/ios`) | `.ipa` / TestFlight / App Store | Apple Developer account required |
| **Windows** | Electron (`/desktop`) | `AiTo-Setup-x.x.x.exe` | GitHub Releases + **auto-update** |
| Android | Capacitor (`/android`) | `.apk` / Play Store | Optional — already scaffolded |

---

## Windows — build via GitHub Actions (recommended)

1. Push a tag:
   ```bash
   git tag desktop-v0.1.0
   git push origin desktop-v0.1.0
   ```
2. GitHub Actions → **Desktop Windows** builds `AiTo-Setup-0.1.0.exe`
3. A GitHub Release is created automatically
4. Users download from https://github.com/ShubhamRSY/ai-thoughts/releases/latest  
   (also linked on `/install` → **Download for Windows**)

Or run the workflow manually: **Actions → Desktop Windows → Run workflow** (uploads an artifact; tag push creates the public Release).

### Local build (optional)

```bash
cd desktop
npm install
npm run pack:win   # → desktop/dist/AiTo-Setup-0.1.0.exe
```

### Auto-update after v0.1.0

Bump `desktop/package.json` `"version"`, tag `desktop-v0.1.1`, push. Installed apps detect the new Release and offer **Restart now**.

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
