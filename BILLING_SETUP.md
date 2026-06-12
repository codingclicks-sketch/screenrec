# VeoRec — Paddle Billing Setup (Sandbox → Live)

The code is fully wired. You only need to (1) create the product/price + webhook in
Paddle and (2) paste the resulting keys into **Railway env vars**. I can't enter
secrets or operate the Paddle dashboard for you — those steps are marked **YOU**.

**How switching works:** the server reads `*_SANDBOX` vars when `PADDLE_ENVIRONMENT=sandbox`
and the plain vars when `PADDLE_ENVIRONMENT=production`. So you set **both** sets once
and flip a single var to go live. Your live keys are never used while in sandbox.

Webhook URL (same for both, Paddle signs each environment separately):
```
https://screenrec-api-production.up.railway.app/api/webhooks/paddle
```

---

## ✅ Phase 1 — Sandbox (test a real checkout, no real money)

### A. In the Paddle **sandbox** dashboard (sandbox-vendors.paddle.com) — YOU
1. **Catalog → Products** → New product "VeoRec Pro". Add a **recurring price** of
   **$7.99 / month** → copy the **price id** (`pri_...`).
2. **Developer Tools → Authentication**:
   - Copy the **Client-side token** (starts `test_...`).
   - **Generate an API key** → copy it.
3. **Developer Tools → Notifications → + New destination**:
   - URL = the webhook URL above. Type = **Webhook**.
   - Events: select **all** `subscription.*`, `transaction.completed`,
     `transaction.payment_failed`, `customer.created`, `customer.updated`.
   - Save → open it → copy the **Secret key** (`pdl_ntfset_...`).
4. **Checkout settings → Approved domains** → add `veorec.com`.

### B. In **Railway** → service → Variables — YOU
```
PADDLE_ENVIRONMENT=sandbox
PADDLE_CLIENT_TOKEN_SANDBOX=test_xxxxxxxx
PADDLE_API_KEY_SANDBOX=xxxxxxxx
PADDLE_WEBHOOK_SECRET_SANDBOX=pdl_ntfset_xxxxxxxx
PADDLE_PRICE_PRO_MONTHLY_SANDBOX=pri_xxxxxxxx
PAYMENTS_LIVE=true
```
(Leave your existing live vars as-is — they're ignored in sandbox.) Save → Railway redeploys.

### C. Test — YOU (I'll verify with you)
1. Sign in on veorec.com → **Pricing** (the page shows a "Test mode" banner).
2. **Upgrade to Pro** → Paddle overlay opens → pay with sandbox test card
   **`4242 4242 4242 4242`**, any future expiry, any CVC, any ZIP.
3. Within a few seconds the webhook flips your account to **Pro**.

**Tell me when you've set the vars** and I'll confirm `/api/billing/config` shows
`enabled:true, env:"sandbox"`, watch the webhook land, and check your account upgraded.

---

## 🚀 Phase 2 — Go live (after the sandbox test passes)

### A. In the Paddle **live** dashboard (vendors.paddle.com) — YOU
Repeat A.1–A.4 in the **live** account: create the Pro product/price, copy the
**live** client token (`live_...`) + API key, create the **live** notification
destination (same webhook URL) → copy its secret, approve `veorec.com`.
*(Your live client token `live_9ff6…` and price `pri_01kt…` are already in Railway —
reuse or re-copy to be safe.)*

### B. In **Railway** — YOU
```
PADDLE_ENVIRONMENT=production
PADDLE_CLIENT_TOKEN=live_xxxxxxxx          # already set
PADDLE_API_KEY=xxxxxxxx                     # live API key
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxxxxxxx   # live notification secret
PADDLE_PRICE_PRO_MONTHLY=pri_xxxxxxxx       # already set (pri_01kt…)
PADDLE_PRICE_PRO_YEARLY=pri_xxxxxxxx        # optional, if you sell annual
PAYMENTS_LIVE=true
```
Save → redeploy. `/api/billing/config` should show `enabled:true, env:"production"`,
and the Pricing/Billing pages drop "Coming soon" and open the real checkout.

### To pause sales again any time
Set `PAYMENTS_LIVE=false` (or remove it) → everything reverts to the clean
"Coming soon" state instantly, no code change.

---

## Safety built in
- Checkout only enables when **client token + price + webhook secret** are all present
  (so a payment can't be taken without the webhook that grants Pro).
- Checkout price is resolved **server-side** (client can't inject a price).
- The webhook **verifies Paddle's HMAC signature** and rejects forged calls.
