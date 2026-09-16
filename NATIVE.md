# AiTo native apps (iOS + Windows)

Same live site as the web app (`https://aito.social`) wrapped in native shells.

| Platform | Shell | Output | How users get it |
|----------|--------|--------|------------------|
| **iOS** | Capacitor (`/ios`) | `.ipa` / TestFlight / App Store | Apple Developer ~$99/yr |
| **Windows** | Electron (`/desktop`) | **Microsoft Store** (APPX) | Microsoft Partner Center ~$19 once |
| Android | Capacitor (`/android`) | `.apk` / Play Store | Optional |

Phone users can also **Add to Home Screen** at aito.social ($0).

---

## Windows — Microsoft Store (primary)

Users should **not** go to GitHub. They install from the Microsoft Store.

### What you do

1. Create a [Microsoft Partner Center](https://partner.microsoft.com/dashboard) developer account (~$19 one-time).
2. Create a new app reservation named **AiTo**.
3. On a Windows PC (or CI), build the Store package:
   ```bash
   cd desktop
   npm install
   npm run pack:msstore
   ```
   Output: `desktop/dist/*.appx` (or `.msix`).
4. In Partner Center, set `appx.identityName` / `publisher` in `desktop/package.json` to match the values Partner Center shows, then rebuild.
5. Upload the package, submit for certification.
6. When the listing is live, copy the Store URL (e.g. `https://apps.microsoft.com/detail/...`).
7. In **Vercel → Environment Variables** (Production):
   ```
   NEXT_PUBLIC_MS_STORE_URL=https://apps.microsoft.com/detail/YOUR_ID
   ```
8. Redeploy. `/install` and the PC notice will show **Get it on Microsoft Store**.

Until that env var is set, the site shows **Coming soon on Microsoft Store** (no GitHub link).

### Updates

Store installs update through the **Microsoft Store** automatically — you don’t need GitHub auto-update for Store users.

---

## Optional: local .exe (dev / sideload only)

Not linked on the public site:

```bash
cd desktop
npm run pack:win   # NSIS installer for testing
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
