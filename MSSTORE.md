# Upload AiTo to Microsoft Partner Center

## Do not upload `package.json`

Partner Center only accepts a built Store package:

- ✅ `Something.appx` or `Something.msix`
- ❌ `package.json` (source config — causes “unknown package type”)
- ❌ `.exe` / NSIS installer (wrong type for an MSIX listing)

`desktop/package.json` only configures the build. **Never upload that JSON file.**

---

You do **not** need Visual Studio. Build with Electron, upload the `.appx` in the browser.

Use the **same Microsoft account** for Partner Center that owns the developer enrollment.

---

## 1. Partner Center — create the app

1. Open [partner.microsoft.com/dashboard](https://partner.microsoft.com/dashboard).
2. **Apps and games** → **New product** → **MSIX or PWA app**.
3. Reserve the name **AiTo**.

## 2. Copy Product Identity (required)

**Product management** → **Product identity**. Paste into `desktop/package.json` → `build.appx`:

| Partner Center field | Field in `package.json` |
|----------------------|-------------------------|
| Package/Identity/Name | `identityName` |
| Package/Identity/Publisher | `publisher` (`CN=…`) |
| PublisherDisplayName | `publisherDisplayName` |

Keep `"applicationId": "AiTo"`. Commit and push **before** building.

## 3. Build the APPX (GitHub Actions — works from a Mac)

1. After identity values are pushed:
2. GitHub → **Actions** → **Desktop Microsoft Store APPX** → **Run workflow**.
3. Download artifact **AiTo-Microsoft-Store-APPX**.
4. Unzip → use the `.appx` / `.msix` inside.

On a Windows PC instead:

```bash
cd desktop
npm install
npm run pack:msstore
```

## 4. Upload in Partner Center

1. Submission → **Packages**.
2. Remove the failed `package.json` upload.
3. Upload the **`.appx`** / **`.msix`** only.
4. Privacy policy: `https://aito.social/privacy`
5. Finish listing → **Submit for certification**.

## 5. After it’s live

```
NEXT_PUBLIC_MS_STORE_URL=https://apps.microsoft.com/detail/YOUR_ID
```

Set that on Vercel Production and redeploy.
