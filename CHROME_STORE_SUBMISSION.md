# VeoRec — Chrome Web Store Submission Guide

Current package (project root): **`veorec-extension-v1.7.1.zip`** — clean build, 10 runtime files, manifest at root.

> ⚠️ **v1.7.1 is a bug-fix update.** The published v1.7.0 shipped with a CSP-blocked
> inline-handler bug that broke the **Sign up / Sign in toggle and Sign out** in the popup.
> v1.7.1 fixes it (clicks wired via `addEventListener`). **Upload v1.7.1 as a new version
> to replace the broken one** — do NOT keep v1.7.0 live.

## 🔄 Publishing the update (the item already exists)
1. Go to the **Developer Dashboard**: https://chrome.google.com/webstore/devconsole
2. Open your **VeoRec** item → **Package** → **Upload new package**.
3. Upload **`veorec-extension-v1.7.1.zip`** (Chrome requires the higher version number — 1.7.1 ✓).
4. Listing copy/graphics below are unchanged; only re-touch if you want.
5. **Save draft → Submit for review.**

*(First-time submission steps — $5 registration, Add new item — are only needed once and are already done.)*

---

## 📋 Store Listing — copy/paste

### Item name
```
VeoRec — Screen Recorder & Share
```

### Summary (max 132 chars)
```
Record your screen, camera & mic, then get an instant shareable link with AI transcription. Free & fast — a Loom alternative.
```

### Detailed description
```
VeoRec is the fastest way to record your screen and share it with anyone.

Click record, pick a screen, window or tab, talk through what you're showing,
and the moment you stop you get a shareable link — copied and ready to send to
clients, teammates, or students.

★ FEATURES
• One-click screen recording (full screen, a window, or a browser tab)
• Record your microphone and a floating webcam bubble alongside your screen
• Choose quality: 1080p, 720p, or 480p
• Instant shareable link the moment you stop — anyone with the link can watch
• Built-in editor: trim, split and cut parts of your recording
• AI transcription: timestamped, searchable transcripts (Pro)
• Viewer reactions, timestamped comments, and view analytics
• Private dashboard — your recordings are tied to your account

★ PERFECT FOR
• Freelancers & agencies sending walkthroughs to clients
• Support teams answering tickets with a quick video
• Teachers and students explaining work
• Anyone who'd rather show than type

★ HOW IT WORKS
1. Create a free account in the extension
2. Click "Start Recording" and choose what to share
3. Click "Stop" — your video uploads automatically
4. Copy the link and share it anywhere

The free plan lets you keep up to 30 videos of up to 10 minutes each. Upgrade to
Pro for unlimited videos, unlimited recording length, AI transcription, no
VeoRec branding, and viewer analytics.

The extension never reads your browsing history or the content of the sites you
visit. Recording starts only when you explicitly click record and pick a screen.

Privacy policy: https://veorec.com/privacy
```

### Category: `Productivity`   ·   Language: `English`

---

## 🔐 Privacy practices tab

### Single purpose
```
VeoRec lets users record their screen, camera and microphone and share the
recording via a link. The extension's single purpose is screen recording and sharing.
```

### Permission justifications  (⚠️ must match the manifest — all five)
```
storage    — stores the user's login token and in-progress recording state on
             their own device so they stay signed in and a recording can be
             recovered if an upload fails. No browsing data is stored.

activeTab  — used to place the optional floating webcam bubble / recording
             toolbar on the tab the user is recording.

scripting  — injects that webcam-bubble + toolbar overlay into the page when the
             user starts a "screen + camera" recording.

tabs       — lets the on-screen recording toolbar keep working when the user
             switches between tabs during a recording, and opens the saved
             video's link in a new tab when the recording finishes.

host_permissions (http/https) — the camera-bubble overlay can be injected on
             whatever page the user chooses to record, so the extension needs to
             run its content script on the active tab regardless of the site.
             It only acts on a tab when the user explicitly starts a recording;
             it does not read page content or browsing history.
```
> Note: broad host permissions get extra review scrutiny. If review pushes back,
> the fallback is to rely on `activeTab` only and drop `http://*/*` `https://*/*`
> — the camera bubble would then inject only after a user gesture on the active tab.

### Using remote code? `No`

### Data usage — tick and certify
- ✅ Personally identifiable information (name, email — for the account)
- ✅ Authentication information (login token stored locally)
- ✅ User-generated content (the videos the user records and uploads)
- ✅ "I do not sell or transfer user data to third parties…"
- ✅ "…not for purposes unrelated to my item's single purpose"
- ✅ "…not to determine creditworthiness or for lending"

### Privacy policy URL: `https://veorec.com/privacy`

---

## 🖼️ Graphics

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | ✅ in zip (`icon128.png`); 512px at `extension/store-icon-512.png` |
| Screenshots (1–5) | 1280×800 PNG | ⚠️ you capture these |
| Small promo tile (optional) | 440×280 | optional |

### Recommended screenshots
1. Extension popup with "Start Recording".
2. Recorder page with the timer mid-recording.
3. "Saved ✓ — copy shareable link" state.
4. Dashboard/library grid.
5. The Loom-style watch page (`/watch/...`) showing the Transcript tab.

---

## ✅ Pre-submission checklist
- [x] Manifest V3, **version 1.7.1** (popup inline-handler bug fixed)
- [x] 16 / 48 / 128 px icons included
- [x] No remote code, no dead files (dev scripts excluded from zip)
- [x] Privacy policy live at https://veorec.com/privacy
- [x] Backend (Railway) + web app (Vercel) live and working
- [ ] Developer account registered ($5) — **your step**
- [ ] Screenshots uploaded — **your step**
- [ ] Submitted for review — **your step**

## 🔁 Updating later
1. Bump `"version"` in `extension/manifest.json` (Chrome requires a higher number each upload).
2. Re-zip **only these 10 runtime files**, with `manifest.json` at the zip root:
   `manifest.json`, `background.js`, `popup.html`, `popup.js`, `recorder.html`,
   `recorder.js`, `overlay.js`, `icon16.png`, `icon48.png`, `icon128.png`.
   Exclude dev/listing files: `make-icons.cjs`, `bubble.js` (orphan), `store-icon-512.png`, `*.zip`.
3. Dashboard → your item → **Package** → **Upload new package** → Submit.

> The current `veorec-extension-v1.7.1.zip` was already built this way and verified
> to contain no inline handlers — upload it directly as the new version.
