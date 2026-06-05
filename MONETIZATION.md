# VeoRec Monetization System

A complete, capability-based monetization layer — plans, Paddle billing, usage
tracking, feature gating, conversion analytics, billing & admin dashboards —
built on VeoRec's existing stack (Express + JSON-store on a Railway volume +
JWT/Google auth + React/Vite + CSS Modules). **No Prisma, Clerk, Next.js or
Tailwind** — it slots into what's already deployed.

---

## 1. Core architecture rule — capability-based, never name-based

```js
// ❌ never
if (user.plan === 'pro') { … }

// ✅ always
if (entitlements.resolve(user).features.analyticsEnabled) { … }
```

The single source of truth is [`server/plans.js`](server/plans.js). A plan is a
set of **capabilities + limits**. Billing cycle (monthly/yearly) lives on the
*subscription*, not the plan — Pro Monthly and Pro Annual are the **same plan**.

Adding **Business** or **Enterprise** later = add an entry to `plans.js` and set
its Paddle price env vars. No code changes, no data migration. They're already
defined (`purchasable: false`) so the system understands them today.

---

## 2. Data models (JSON stores on the Railway volume `DATA_DIR`)

| Spec model     | Where it lives                                  |
|----------------|-------------------------------------------------|
| `User`         | `users.json` (`server/users.js`) — adds `planId`, `paddleCustomerId` |
| `Plan`         | `server/plans.js` (code catalog — capability source of truth) |
| `Subscription` | `subscriptions.json` (`server/subscriptions.js`) |
| `Usage`        | `usage.json` (`server/usage.service.js`)         |
| `Video`        | Cloudinary (prod) / `recordings.json` (dev) + `meta.json` |
| `FeatureAccess`| Derived at runtime by `server/entitlements.js` (no table needed) |
| Upgrade events | `upgrade_events.json` (`server/conversion.js`)   |

> Everything is keyed JSON on the persistent volume — same model as the existing
> `users.json`/`meta.json`, so it survives Railway redeploys. If you outgrow
> JSON, swap the store modules for a DB without touching business logic.

---

## 3. Backend modules (`server/`)

| File | Responsibility |
|------|----------------|
| `plans.js` | Capability catalog: Free, Pro, Business*, Enterprise* (* defined, not sold). `getPlan`, `resolvePlanByPriceId`, `publicPlan`. |
| `entitlements.js` | Resolves a user → effective plan + capabilities (the gating authority). |
| `subscriptions.js` | Subscription store + `isEntitled()` (handles `past_due` grace). |
| `usage.service.js` | `updateUsage`, `recalculateUsage`, `syncUsage`, `getUsageSummary`. |
| `permissions.service.js` | `canUploadVideo`, `canRecord`, `canUseAnalytics`, `canUploadThumbnail`, `canRemoveBranding`, `canUsePriorityProcessing`, `canUsePasswordProtectedVideos`. Returns `{allowed, reason?, upgradeRequired?, meta?}`. |
| `billing.config.js` | Paddle product/price map from env (`getPriceId`, `isBillingEnabled`). |
| `billing.service.js` | `createCheckout`, `upgradeToMonthly/Annual`, `cancel/resume/changePlan`, `getSubscription`, `syncSubscription`, `getCustomerPortal`. |
| `webhooks.paddle.js` | Signed webhook → updates subscription + plan. All 9 spec events. |
| `conversion.js` | Upgrade-event tracking (`featureRequested`, `userPlan`, `timestamp`). |
| `cron.js` | In-process daily jobs: `dailyUsageSync`, `dailySubscriptionSync`, `dailyStorageVerification` (no extra infra). |
| `store.js` | Tiny JSON-store factory (DRY). |

### Security — every premium path is enforced server-side

| Action | Enforced in `index.js` by |
|--------|---------------------------|
| Upload (storage limit) | `permissions.canUploadVideo(user, sizeBytes)` **before** Cloudinary upload |
| Recording length | `permissions.canRecord(user, durationSeconds)` — validated after upload, never trusting the client |
| Analytics | `permissions.canUseAnalytics` on `GET /api/recordings/:id/analytics` |
| Password protection | `permissions.canUsePasswordProtectedVideos` on `PATCH …/meta` |
| Remove branding | `permissions.canRemoveBranding` on `PATCH …/meta` |

The frontend `entitlements` summary is **UI hint only** — it shows/hides upgrade
buttons. Access is always re-checked on the server.

---

## 4. API surface (added to `server/index.js`)

```
GET  /api/plans                      public capability-based pricing data
GET  /api/me/entitlements   (auth)   effective plan + capabilities (UI render)
GET  /api/me/usage          (auth)   storage/videos/minutes vs plan limits

GET  /api/billing/config             { enabled, clientToken, env, prices }
POST /api/billing/checkout  (auth)   → Paddle.js overlay config
GET  /api/billing/subscription (auth)
POST /api/billing/sync      (auth)   reconcile with Paddle
POST /api/billing/cancel    (auth)   cancel at period end
POST /api/billing/resume    (auth)
POST /api/billing/change-plan (auth) monthly ↔ yearly
GET  /api/billing/portal    (auth)   Paddle customer portal URL

POST /api/events/upgrade-intent (auth)  record a paywall impression

POST /api/webhooks/paddle            signed Paddle webhook (canonical)
POST /api/billing/paddle/webhook     legacy alias (same handler)

GET  /api/admin/metrics  (auth+admin) MRR, churn, upgrade rate, top users…
```

---

## 5. Frontend (`client/src/`)

| Component | File |
|-----------|------|
| `useBilling()` hook | `hooks/useBilling.js` — fetches entitlements + usage |
| `PricingTable` | `components/PricingTable.jsx` — monthly/annual toggle, capability rows |
| `UpgradeModal` | `components/UpgradeModal.jsx` — per-feature paywall copy |
| `PlanBadge` | `components/PlanBadge.jsx` |
| `StorageMeter` | `components/StorageMeter.jsx` — 80%/95% colour thresholds |
| `UsageMeter` | `components/UsageMeter.jsx` |
| `SubscriptionCard` | `components/SubscriptionCard.jsx` |
| `BillingCard` | `components/BillingCard.jsx` |
| Billing page | `pages/Billing.jsx` → `/billing` and `/dashboard/billing` |
| Admin page | `pages/Admin.jsx` → `/admin` |
| Pricing page | `pages/Pricing.jsx` (rewired to capability table) |

Dashboard now shows a live **StorageMeter**, a **Billing & plan** link, and pops
the **UpgradeModal** automatically when a premium action returns `403
upgradeRequired`.

---

## 6. Environment variables

### Backend (Railway — service `screenrec-api`)
```bash
# Core (already set)
DATA_DIR=/data
JWT_SECRET=…
CLOUDINARY_CLOUD_NAME=…   CLOUDINARY_API_KEY=…   CLOUDINARY_API_SECRET=…
CLIENT_URL=https://veorec.com
PUBLIC_URL=https://screenrec-api-production.up.railway.app
GOOGLE_CLIENT_ID=…             # (Google sign-in, already configured)
BREVO_API_KEY=…  EMAIL_FROM=…  # (password reset emails — optional)

# Paddle Billing  ── NEW
PADDLE_ENVIRONMENT=production          # or 'sandbox'
PADDLE_API_KEY=…                       # server-to-server (cancel/resume/portal/sync)
PADDLE_CLIENT_TOKEN=…                  # public, used by Paddle.js
PADDLE_WEBHOOK_SECRET=…                # notification signing secret (ntfset → "Secret key")
PADDLE_PRICE_PRO_MONTHLY=pri_…         # $7.99/mo price id
PADDLE_PRICE_PRO_YEARLY=pri_…          # $79/yr price id
# (legacy single PADDLE_PRICE_ID still works as the monthly fallback)
PADDLE_PRODUCT_PRO=pro_…               # optional

# Admin dashboard access
ADMIN_EMAILS=codingclicks@gmail.com    # comma-separated allowlist

# Future plans (leave unset until you sell them)
# PADDLE_PRICE_BUSINESS_MONTHLY=  PADDLE_PRICE_BUSINESS_YEARLY=
```

### Frontend (Vercel)
```bash
VITE_API_URL=https://screenrec-api-production.up.railway.app
```

---

## 7. Paddle setup (one-time)

1. **Catalog → Products** → create "VeoRec Pro".
2. Add two **Prices** on it: `$7.99 / month` and `$79 / year`. Copy each
   `pri_…` id into `PADDLE_PRICE_PRO_MONTHLY` / `PADDLE_PRICE_PRO_YEARLY`.
3. **Developer Tools → Authentication** → create an **API key** →
   `PADDLE_API_KEY`. Copy the **client-side token** → `PADDLE_CLIENT_TOKEN`.
4. **Developer Tools → Notifications** → add a destination:
   `https://<api-host>/api/webhooks/paddle`. Subscribe to:
   `subscription.created/updated/activated/canceled/paused/resumed`,
   `transaction.completed`, `transaction.payment_failed`,
   `customer.created/updated`. Copy its **Secret key** → `PADDLE_WEBHOOK_SECRET`.
   > ⚠️ Use the destination's **Secret key** (signing secret), *not* the
   > `ntfset_…` destination id.
5. Set `PADDLE_ENVIRONMENT=sandbox` while testing; flip to `production` once your
   Paddle account is verified for live payments.

The app degrades gracefully until these are set: `/api/billing/config` reports
`enabled:false`, the pricing page shows "Checkout activates once Paddle is
connected", and no premium access is granted.

---

## 8. Deploy

**Backend (Railway):** push to `main` → auto-deploys the `screenrec-api`
service. Add the Paddle + `ADMIN_EMAILS` env vars in the service's Variables
tab, then redeploy. Confirm: `curl https://<api>/api/plans` returns the catalog
and `curl https://<api>/api/billing/config` shows `enabled:true`.

**Frontend (Vercel):** push to `main` → auto-deploys. Ensure `VITE_API_URL`
points at the Railway backend.

**Cloudinary:** unchanged — videos stay in `screenrec/<userId>/<id>`. The daily
`dailyUsageSync` cron recomputes each user's true storage from Cloudinary, so
usage self-heals even if an incremental update is missed.

---

## 9. Plan summary

| | Free | Pro |
|---|---|---|
| Price | $0 | **$7.99/mo** or **$79/yr** (2 months free) |
| Videos | Unlimited | Unlimited |
| Recording length | 5 min | 120 min |
| Storage | 2 GB | 100 GB |
| Exports | 720p | 1080p |
| VeoRec branding | On | Removable |
| Analytics / Thumbnails / Password / Priority / Advanced sharing | — | ✓ |

Business & Enterprise are pre-architected in `plans.js` and ship the moment you
set their price env vars and flip `purchasable: true`.
