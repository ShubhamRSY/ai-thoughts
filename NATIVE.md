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

**Full step-by-step:** see [`MSSTORE.md`](./MSSTORE.md) (Partner Center identity, build APPX, upload, privacy URL).

Users should **not** go to GitHub. They install from the Microsoft Store.

You do **not** need Visual Studio. Build with Electron (`npm run pack:msstore` in `/desktop`), then upload the `.appx` in Partner Center. Use the same Microsoft account that owns your developer enrollment. Copy **Product identity** values into `desktop/package.json` → `build.appx` before building, or upload will fail.

### Short path

1. [Partner Center](https://partner.microsoft.com/dashboard) → reserve **AiTo** (MSIX/PWA product).
2. Paste Product identity → `desktop/package.json` `appx` fields.
3. On Windows: `cd desktop && npm install && npm run pack:msstore`
4. Upload `desktop/dist/*.appx` → submission → privacy `https://aito.social/privacy`
5. When live, set `NEXT_PUBLIC_MS_STORE_URL` on Vercel and redeploy.

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
