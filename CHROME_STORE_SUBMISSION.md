# VeoRec — Chrome Web Store Submission Guide

Upload file (project root): **`veorec-extension-v1.7.0.zip`**

---

## ⚠️ What only YOU can do
The store requires a **one-time $5 developer registration fee** and a Google account.
I can't create accounts or enter payment on your behalf — you do these steps:

1. Go to the **Chrome Web Store Developer Dashboard**: https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account (`codingclicks@gmail.com` for consistency).
3. Pay the **$5 one-time** registration fee (covers up to 20 extensions, forever).
4. Click **"Add new item"** and upload `veorec-extension-v1.7.0.zip`.
5. Fill in the listing using the copy below.
6. Click **Submit for review** (typically a few hours to a few days).

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

Free plan includes 5-minute recordings and 2GB storage. Upgrade to Pro for
2-hour recordings, 100GB, AI transcription, no branding, and analytics.

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
- [x] Manifest V3, **version 1.7.0**
- [x] 16 / 48 / 128 px icons included
- [x] No remote code, no dead files (dev scripts excluded from zip)
- [x] Privacy policy live at https://veorec.com/privacy
- [x] Backend (Railway) + web app (Vercel) live and working
- [ ] Developer account registered ($5) — **your step**
- [ ] Screenshots uploaded — **your step**
- [ ] Submitted for review — **your step**

## 🔁 Updating later
1. Bump `"version"` in `extension/manifest.json`.
2. Re-zip runtime files (`manifest.json`, `*.js`, `*.html`, `icon*.png`) — exclude `make-icons.cjs`, `*.zip`, `store-icon-512.png`.
3. Dashboard → your item → **Package** → **Upload new package** → Submit.
