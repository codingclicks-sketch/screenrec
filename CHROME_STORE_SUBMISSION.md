# VeoRec — Chrome Web Store Submission Guide

Everything you need to publish the extension. The packaged upload file is:

**`screenrec-extension-v1.0.0.zip`** (in the project root)

---

## ⚠️ What only YOU can do
The store requires a **one-time $5 developer registration fee** and a Google account.
I can't create accounts or enter payment on your behalf — you'll do these steps:

1. Go to the **Chrome Web Store Developer Dashboard**: https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account (use `codingclicks@gmail.com` for consistency).
3. Pay the **$5 one-time** registration fee (covers up to 20 extensions, forever).
4. Click **"Add new item"** and upload `screenrec-extension-v1.0.0.zip`.
5. Fill in the listing using the copy below.
6. Click **Submit for review**. Review usually takes **a few hours to a few days**.

---

## 📋 Store Listing — copy/paste these fields

### Item name
```
VeoRec — Screen Recorder & Share
```

### Summary (short description, max 132 chars)
```
Record your screen, camera & mic, then get an instant shareable link. Free, fast, no watermark — a simple Loom alternative.
```

### Detailed description
```
VeoRec is the fastest way to record your screen and share it with anyone.

Click record, pick a screen or window, talk through what you're showing, and
the moment you stop you get a shareable link — copied and ready to send to
clients, teammates, or students. No watermarks, no time limits, no friction.

★ FEATURES
• One-click screen recording (full screen, a window, or a browser tab)
• Record your microphone alongside your screen
• Choose quality: 1080p, 720p, or 480p
• Instant shareable link the moment you stop — anyone with the link can watch
• Private dashboard — your recordings are tied to your account and only you see them
• Free, with no watermark on your videos

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

Your privacy matters: the extension only uses local storage to keep you signed
in. It never reads your browsing history or the content of the sites you visit.
Recording starts only when you explicitly click record and pick a screen.

Privacy policy: https://veorec.com/privacy
```

### Category
```
Productivity
```

### Language
```
English
```

---

## 🔐 Privacy practices tab (required answers)

### Single purpose (required)
```
VeoRec lets users record their screen, camera and microphone and share the
recording via a link. The extension's single purpose is screen recording and sharing.
```

### Permission justifications
```
storage   — keeps the user's login token and recording state on their own
            device so they stay signed in between sessions.
activeTab — lets the user place a floating webcam bubble on the tab they are
            recording, only on the tab they explicitly invoke the extension on.
scripting — injects that webcam-bubble overlay element into the active tab when
            the user starts a "screen + camera" recording.
No browsing data is collected or transmitted.
```

### Are you using remote code?
```
No
```

### Data usage — what the extension collects
Tick these in the form and confirm the disclosures:
- ✅ **Personally identifiable information** (name, email — for the account)
- ✅ **Authentication information** (login token stored locally)
- ✅ **User-generated content** (the videos the user records and uploads)

Then certify:
- ✅ "I do not sell or transfer user data to third parties, outside of the approved use cases"
- ✅ "I do not use or transfer user data for purposes unrelated to my item's single purpose"
- ✅ "I do not use or transfer user data to determine creditworthiness or for lending purposes"

### Privacy policy URL (required)
```
https://veorec.com/privacy
```

---

## 🖼️ Graphics you need to upload

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | ✅ Included in the zip (`icon128.png`); a 512px version is at `extension/store-icon-512.png` if a larger one is requested |
| Screenshots (1–5) | 1280×800 or 640×400 PNG | ⚠️ You add these — see below |
| Small promo tile (optional) | 440×280 | Optional |
| Marquee promo (optional) | 1400×560 | Optional |

### Recommended screenshots (take these once the extension is loaded)
1. The extension popup with the "Start Recording" button visible.
2. The recorder page showing the timer mid-recording.
3. The "Saved! Copy shareable link" state after a recording.
4. The dashboard showing a few recordings.
5. The shared video player page (`/watch/...`).

Tip: take them at 1280×800 for the crispest listing.

---

## ✅ Pre-submission checklist
- [x] Manifest V3, version 1.0.0
- [x] 16 / 48 / 128 px PNG icons included
- [x] Minimal permissions (only `storage` — no scary install warnings)
- [x] No remote code, no dead files
- [x] Privacy policy live at https://veorec.com/privacy
- [x] Backend (Railway) + dashboard (Vercel) live and working
- [ ] Developer account registered ($5) — **your step**
- [ ] Screenshots uploaded — **your step**
- [ ] Submitted for review — **your step**

---

## 🔁 Updating the extension later
When you change extension code:
1. Bump `"version"` in `extension/manifest.json` (e.g. 1.0.0 → 1.0.1).
2. Re-zip the runtime files (manifest, popup.*, recorder.*, icon*.png).
3. Upload the new zip in the dashboard under your item → **Package** → **Upload new package**.
4. Submit for review again.
```
