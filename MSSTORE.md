# Upload AiTo to Microsoft Partner Center

You do **not** need Visual Studio for this app. AiTo’s Windows package is built with Electron (`desktop/`). The Partner Center note about “sign in with the same account in Visual Studio” only matters if you package with Visual Studio — skip it for Electron.

Use the **same Microsoft account** in the browser for Partner Center that paid for the developer registration.

---

## 1. Partner Center — create the app

1. Open [partner.microsoft.com/dashboard](https://partner.microsoft.com/dashboard) and sign in.
2. **Apps and games** → **New product** → **MSIX or PWA app** (not EXE/MSI — Store signs MSIX/APPX for you).
3. Reserve the name **AiTo** (or your exact listing name).

## 2. Copy Product Identity (required)

In the app: **Product management** → **Product identity** (sometimes under **App identity**).

Copy these **exactly** (character-for-character):

| Partner Center field | Paste into `desktop/package.json` → `build.appx` |
|----------------------|--------------------------------------------------|
| Package/Identity/Name | `identityName` |
| Package/Identity/Publisher | `publisher` (looks like `CN=XXXXXXXX-XXXX-…`) |
| Package/Properties/PublisherDisplayName | `publisherDisplayName` |

Example after you paste (yours will differ):

```json
"appx": {
  "applicationId": "AiTo",
  "identityName": "12345YourPublisher.AiTo",
  "publisher": "CN=A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  "publisherDisplayName": "Your Publisher Name",
  "displayName": "AiTo",
  "languages": ["en-US"]
}
```

Important:

- `identityName` often starts with numbers — **keep those numbers**.
- `applicationId` must stay **`AiTo`** (letters only; cannot start with a number).
- If `publisher` / `identityName` don’t match Partner Center, upload fails or you see identity/account warnings.

Commit the updated `desktop/package.json` after you paste your real values.

## 3. Build the APPX (Windows PC)

On a **Windows** machine with Node.js:

```bash
cd desktop
npm install
npm run pack:msstore
```

Output file (upload this):

`desktop/dist/AiTo-Setup-0.1.0.appx`  
(or similar `*.appx` / `*.msix` under `desktop/dist/`)

You can also build from GitHub Actions on `windows-latest` if you add a Store packaging job later.

## 4. Upload in Partner Center

1. Open your AiTo app → **Start your submission** (or open a draft).
2. **Packages** → upload the `.appx` from step 3.
3. Fill the rest of the submission:
   - **Privacy policy URL:** `https://aito.social/privacy`
   - **Website:** `https://aito.social`
   - **Support / contact:** your `keepers@aito.social` (or Partner Center contact)
   - Age rating questionnaire
   - Store listing: description, screenshots (desktop 1366×768 or Store-required sizes)
   - Pricing: free is fine
4. **Submit for certification** (often 1–3 business days).

## 5. After it’s live

1. Copy the Store URL, e.g. `https://apps.microsoft.com/detail/...`
2. Vercel → Production env:

```
NEXT_PUBLIC_MS_STORE_URL=https://apps.microsoft.com/detail/YOUR_ID
```

3. Redeploy. `/install` will show **Get it on Microsoft Store**.

---

## About that Visual Studio message

> “If you are using Visual Studio, be sure you signed in with the same account…”

- **Electron / this repo:** ignore Visual Studio. Build with `npm run pack:msstore`, upload the `.appx` in the browser.
- **Same account:** Partner Center login = the Microsoft account that owns the developer enrollment.
- **Identity mismatch:** almost always wrong `publisher` / `identityName` in `desktop/package.json` — fix from Product identity, rebuild, re-upload.

---

## Checklist

- [ ] Developer account active in Partner Center
- [ ] App reserved (AiTo)
- [ ] Product identity values pasted into `desktop/package.json`
- [ ] `npm run pack:msstore` on Windows → `.appx` created
- [ ] Package uploaded + privacy URL `https://aito.social/privacy`
- [ ] Submitted for certification
- [ ] Live Store URL set as `NEXT_PUBLIC_MS_STORE_URL`
