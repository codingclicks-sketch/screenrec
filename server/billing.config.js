// ─────────────────────────────────────────────────────────────────────────────
// BILLING CONFIG  —  structured Paddle product/price map, sourced from env.
// Never hardcode Paddle ids in source. Add a plan → add env vars → done.
// ─────────────────────────────────────────────────────────────────────────────
const env = (k) => process.env[k] || null;

const PADDLE_ENVIRONMENT =
  process.env.PADDLE_ENVIRONMENT === 'production' || process.env.PADDLE_ENV === 'production'
    ? 'production'
    : 'sandbox';
const IS_SANDBOX = PADDLE_ENVIRONMENT !== 'production';

// Per-environment credentials. In SANDBOX we read the `*_SANDBOX` vars only, so
// your live keys can never be used by accident; in PRODUCTION we read the plain
// names (plus a couple of back-compat aliases). Set BOTH sets in Railway and you
// switch environments just by flipping PADDLE_ENVIRONMENT — no overwriting keys.
function cred(base, ...prodAliases) {
  if (IS_SANDBOX) return env(`${base}_SANDBOX`);
  return env(base) || prodAliases.map(env).find(Boolean) || null;
}

const PADDLE = {
  environment: PADDLE_ENVIRONMENT,
  apiKey: cred('PADDLE_API_KEY'),
  clientToken: cred('PADDLE_CLIENT_TOKEN'),
  webhookSecret: cred('PADDLE_WEBHOOK_SECRET', 'PADDLE_NOTIFICATION_SECRET'),
  apiBase: IS_SANDBOX ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com',
};

// Product/price catalog. `productId` optional; `priceId` is what checkout needs.
const PRODUCTS = {
  FREE_PLAN: {
    planSlug: 'free',
    name: 'Free',
    productId: null,
    prices: { monthly: { priceId: null, billingCycle: 'monthly' }, yearly: { priceId: null, billingCycle: 'yearly' } },
  },
  PRO_MONTHLY: {
    planSlug: 'pro',
    name: 'Pro Monthly',
    productId: env('PADDLE_PRODUCT_PRO'),
    prices: {
      monthly: {
        // back-compat with the original single PADDLE_PRICE_ID
        priceId: env('PADDLE_PRICE_PRO_MONTHLY') || env('PADDLE_PRICE_ID'),
        billingCycle: 'monthly',
      },
    },
  },
  PRO_ANNUAL: {
    planSlug: 'pro',
    name: 'Pro Annual',
    productId: env('PADDLE_PRODUCT_PRO'),
    prices: {
      yearly: { priceId: env('PADDLE_PRICE_PRO_YEARLY'), billingCycle: 'yearly' },
    },
  },
};

/** Resolve a priceId for a plan slug + billing cycle (environment-aware). */
function getPriceId(planSlug, billingCycle) {
  if (planSlug !== 'pro') return null;
  if (billingCycle === 'monthly') return cred('PADDLE_PRICE_PRO_MONTHLY', 'PADDLE_PRICE_ID');
  if (billingCycle === 'yearly') return cred('PADDLE_PRICE_PRO_YEARLY');
  return null;
}

// Master launch switch. Paddle keys/prices can be fully configured while the
// Paddle account/domain is still pending approval — in that window we must NOT
// take money. Checkout only goes live when PAYMENTS_LIVE=true is set in the env.
// Flip this one var (Railway) the moment Paddle approves the domain.
const PAYMENTS_LIVE = process.env.PAYMENTS_LIVE === 'true';

/** Are the Paddle credentials + a price + the webhook secret present? The
 *  webhook secret is required so checkout can't go live without the loop that
 *  actually grants Pro after payment (no "charged but not upgraded"). */
function isPaddleConfigured() {
  return !!(PADDLE.clientToken && getPriceId('pro', 'monthly') && PADDLE.webhookSecret);
}

/** Is billing actually wired up AND switched live enough to take money? */
function isBillingEnabled() {
  return PAYMENTS_LIVE && isPaddleConfigured();
}

/** Configured but intentionally held back → show "Coming soon" in the UI. */
function isComingSoon() {
  return !PAYMENTS_LIVE;
}

module.exports = { PADDLE, PRODUCTS, getPriceId, isBillingEnabled, isComingSoon, isPaddleConfigured };
