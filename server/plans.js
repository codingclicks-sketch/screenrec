// ─────────────────────────────────────────────────────────────────────────────
// PLAN CATALOG  —  the single source of truth for what each plan can do.
//
// CORE RULE: never hardcode plan names in business logic. Code asks
//   plan.features.analyticsEnabled
// never
//   user.plan === 'pro'
//
// A "plan" describes CAPABILITIES + LIMITS. Billing cycle (monthly vs yearly)
// lives on the Subscription, NOT here — Pro Monthly and Pro Annual are the SAME
// plan (identical capabilities), just billed differently. That is why the spec
// says annual is "Everything included in Pro Monthly".
//
// Adding Business / Enterprise later = add an entry here. No code changes, no DB
// rewrite. They are defined (so the system already understands them) but NOT sold
// — `purchasable: false` keeps them off the pricing page until you flip it on.
// ─────────────────────────────────────────────────────────────────────────────

const GB = 1024 * 1024 * 1024;

// Paddle price IDs are resolved from env so we never hardcode them in source.
// (See billing.config.js for the structured Paddle product map.)
const env = (k) => process.env[k] || null;

/**
 * @typedef {Object} PlanFeatures
 * @property {boolean} analyticsEnabled
 * @property {boolean} customThumbnailEnabled
 * @property {boolean} removeBrandingEnabled
 * @property {boolean} priorityProcessingEnabled
 * @property {boolean} passwordProtectedVideosEnabled
 * @property {boolean} advancedSharingEnabled
 * @property {boolean} basicSharingEnabled
 */

/** @type {Record<string, any>} */
const PLANS = {
  // ── FREE ───────────────────────────────────────────────────────────────────
  free: {
    id: 'plan_free',
    name: 'Free',
    slug: 'free',
    purchasable: true,           // shown on pricing page, but $0 / no checkout
    order: 0,
    monthlyPrice: 0,
    yearlyPrice: 0,
    storageLimitGB: 2,
    storageLimitBytes: 2 * GB,
    recordingLimitMinutes: 5,
    exportQuality: '720p',
    branding: true,              // VeoRec watermark/branding ON
    features: {
      basicSharingEnabled: true,
      advancedSharingEnabled: false,
      analyticsEnabled: false,
      customThumbnailEnabled: false,
      removeBrandingEnabled: false,
      priorityProcessingEnabled: false,
      passwordProtectedVideosEnabled: false,
    },
    paddle: { monthlyPriceId: null, yearlyPriceId: null },
  },

  // ── PRO ──────────────────────────────────────────────────────────────────────
  // One plan, two prices. $7.99/mo or $79/yr ("2 months free").
  pro: {
    id: 'plan_pro',
    name: 'Pro',
    slug: 'pro',
    purchasable: true,
    order: 1,
    badge: 'Most Popular',
    monthlyPrice: 7.99,
    yearlyPrice: 79,
    yearlyBadge: '2 Months Free',
    storageLimitGB: 100,
    storageLimitBytes: 100 * GB,
    recordingLimitMinutes: 120,
    exportQuality: '1080p',
    branding: false,
    features: {
      basicSharingEnabled: true,
      advancedSharingEnabled: true,
      analyticsEnabled: true,
      customThumbnailEnabled: true,
      removeBrandingEnabled: true,
      priorityProcessingEnabled: true,
      passwordProtectedVideosEnabled: true,
    },
    paddle: {
      monthlyPriceId: env('PADDLE_PRICE_PRO_MONTHLY') || env('PADDLE_PRICE_ID'), // back-compat
      yearlyPriceId: env('PADDLE_PRICE_PRO_YEARLY'),
    },
  },

  // ── BUSINESS (architected, NOT sold) ────────────────────────────────────────
  business: {
    id: 'plan_business',
    name: 'Business',
    slug: 'business',
    purchasable: false,
    order: 2,
    monthlyPrice: 24,
    yearlyPrice: 240,
    storageLimitGB: 1024,
    storageLimitBytes: 1024 * GB,
    recordingLimitMinutes: 240,
    exportQuality: '1080p',
    branding: false,
    features: {
      basicSharingEnabled: true,
      advancedSharingEnabled: true,
      analyticsEnabled: true,
      customThumbnailEnabled: true,
      removeBrandingEnabled: true,
      priorityProcessingEnabled: true,
      passwordProtectedVideosEnabled: true,
      // room to grow: teamsEnabled, ssoEnabled, customDomainsEnabled, …
    },
    paddle: {
      monthlyPriceId: env('PADDLE_PRICE_BUSINESS_MONTHLY'),
      yearlyPriceId: env('PADDLE_PRICE_BUSINESS_YEARLY'),
    },
  },

  // ── ENTERPRISE (architected, NOT sold) ──────────────────────────────────────
  enterprise: {
    id: 'plan_enterprise',
    name: 'Enterprise',
    slug: 'enterprise',
    purchasable: false,
    order: 3,
    monthlyPrice: null,          // "Contact us"
    yearlyPrice: null,
    storageLimitGB: 10240,
    storageLimitBytes: 10240 * GB,
    recordingLimitMinutes: 600,
    exportQuality: '4k',
    branding: false,
    features: {
      basicSharingEnabled: true,
      advancedSharingEnabled: true,
      analyticsEnabled: true,
      customThumbnailEnabled: true,
      removeBrandingEnabled: true,
      priorityProcessingEnabled: true,
      passwordProtectedVideosEnabled: true,
    },
    paddle: { monthlyPriceId: null, yearlyPriceId: null },
  },
};

const DEFAULT_PLAN_SLUG = 'free';

/** Resolve a plan by slug. Unknown/legacy values fall back to free safely. */
function getPlan(slug) {
  if (!slug) return PLANS[DEFAULT_PLAN_SLUG];
  return PLANS[String(slug).toLowerCase()] || PLANS[DEFAULT_PLAN_SLUG];
}

/** All plans the public pricing page should render (purchasable, ordered). */
function listPublicPlans() {
  return Object.values(PLANS)
    .filter((p) => p.purchasable)
    .sort((a, b) => a.order - b.order);
}

/** All plans (incl. future) — for admin tooling. */
function listAllPlans() {
  return Object.values(PLANS).sort((a, b) => a.order - b.order);
}

/**
 * Given a Paddle price id, find which plan + billing cycle it belongs to.
 * Used by the webhook to map an incoming subscription back to a plan WITHOUT
 * hardcoding any ids in the handler.
 * @returns {{ plan: any, billingCycle: 'monthly'|'yearly' } | null}
 */
function resolvePlanByPriceId(priceId) {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) {
    if (plan.paddle?.monthlyPriceId === priceId) return { plan, billingCycle: 'monthly' };
    if (plan.paddle?.yearlyPriceId === priceId) return { plan, billingCycle: 'yearly' };
  }
  return null;
}

/** A trimmed, client-safe view of a plan (no internal ids leak). */
function publicPlan(plan) {
  if (!plan) return null;
  return {
    name: plan.name,
    slug: plan.slug,
    badge: plan.badge || null,
    yearlyBadge: plan.yearlyBadge || null,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    storageLimitGB: plan.storageLimitGB,
    recordingLimitMinutes: plan.recordingLimitMinutes,
    exportQuality: plan.exportQuality,
    branding: plan.branding,
    features: { ...plan.features },
    // expose which billing cycles can actually be purchased
    canBuyMonthly: !!plan.paddle?.monthlyPriceId,
    canBuyYearly: !!plan.paddle?.yearlyPriceId,
  };
}

module.exports = {
  PLANS,
  GB,
  DEFAULT_PLAN_SLUG,
  getPlan,
  listPublicPlans,
  listAllPlans,
  resolvePlanByPriceId,
  publicPlan,
};
