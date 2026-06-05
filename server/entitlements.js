// ─────────────────────────────────────────────────────────────────────────────
// ENTITLEMENTS  —  resolve a user's EFFECTIVE plan + capabilities.
//
// This is the one place that decides "what can this user do right now". It looks
// at the user's subscription (source of truth) and falls back to the stored
// planId/plan on the user, then to Free. Capability checks everywhere else call
// resolve(user).features.X  — never compare plan names.
// ─────────────────────────────────────────────────────────────────────────────
const plans = require('./plans');
const subscriptions = require('./subscriptions');

/**
 * Resolve the plan SLUG a user is entitled to.
 * Priority: active paid subscription → user.planId/plan → free.
 */
function resolveSlug(user) {
  if (!user) return plans.DEFAULT_PLAN_SLUG;

  const sub = subscriptions.getByUser(user.id);
  if (sub && subscriptions.isEntitled(sub)) {
    return sub.planSlug || 'pro';
  }

  // No (valid) subscription → user sits on whatever plan field they have.
  // Legacy users stored plan:'pro' as a raw string; honor it only if there is no
  // contradicting (canceled/expired) subscription record.
  if (!sub) {
    const stored = user.planId || user.plan;
    if (stored && plans.getPlan(stored)) return plans.getPlan(stored).slug;
  }

  return plans.DEFAULT_PLAN_SLUG;
}

/**
 * Resolve the full effective plan object (with .features and limits) for a user.
 */
function resolve(user) {
  return plans.getPlan(resolveSlug(user));
}

/** Convenience: just the capability flags. */
function features(user) {
  return resolve(user).features;
}

/**
 * A client-safe entitlement summary the frontend can trust to RENDER ui
 * (show/hide upgrade buttons). Security is still enforced server-side on every
 * premium endpoint — this is for UX only.
 */
function summary(user) {
  const plan = resolve(user);
  const sub = subscriptions.getByUser(user?.id);
  return {
    plan: plans.publicPlan(plan),
    planSlug: plan.slug,
    isPaid: plan.slug !== plans.DEFAULT_PLAN_SLUG,
    subscription: sub
      ? {
          status: sub.status,
          billingCycle: sub.billingCycle,
          currentPeriodEnd: sub.currentPeriodEnd || null,
          cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
        }
      : null,
  };
}

module.exports = { resolve, resolveSlug, features, summary };
