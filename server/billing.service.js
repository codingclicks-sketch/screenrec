// ─────────────────────────────────────────────────────────────────────────────
// BILLING SERVICE  —  Paddle Billing (Merchant of Record) integration.
//
// Checkout itself is the Paddle.js overlay on the frontend (MoR requirement), so
// createCheckout() returns the config the client needs to open it. Everything
// else (cancel / resume / change / portal / sync) is server-to-server via the
// Paddle API using PADDLE_API_KEY.
//
// All functions are defensive: if billing isn't configured they return a clear
// { ok:false } instead of throwing, so the app degrades gracefully pre-launch.
// ─────────────────────────────────────────────────────────────────────────────
const { PADDLE, getPriceId, isBillingEnabled } = require('./billing.config');
const plans = require('./plans');
const subscriptions = require('./subscriptions');

async function paddleApi(method, pathname, body) {
  if (!PADDLE.apiKey) return { ok: false, error: 'PADDLE_API_KEY not configured' };
  try {
    const r = await fetch(`${PADDLE.apiBase}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${PADDLE.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: json?.error?.detail || `Paddle API ${r.status}`, raw: json };
    return { ok: true, data: json.data, meta: json.meta };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Checkout (frontend overlay config) ────────────────────────────────────────
/**
 * Build the config the client needs to open Paddle.js checkout.
 * @param {object} user
 * @param {'monthly'|'yearly'} billingCycle
 * @param {string} [planSlug='pro']
 */
function createCheckout(user, billingCycle = 'monthly', planSlug = 'pro') {
  if (!isBillingEnabled()) return { ok: false, error: 'Billing is not enabled yet' };
  const priceId = getPriceId(planSlug, billingCycle);
  if (!priceId) return { ok: false, error: `No price configured for ${planSlug}/${billingCycle}` };
  return {
    ok: true,
    checkout: {
      priceId,
      planSlug,
      billingCycle,
      clientToken: PADDLE.clientToken,
      environment: PADDLE.environment,
      customer: user?.email ? { email: user.email } : undefined,
      // Carried back to us via the webhook so we can map payment → user.
      customData: { userId: user?.id, planSlug, billingCycle },
    },
  };
}

const upgradeToMonthly = (user) => createCheckout(user, 'monthly', 'pro');
const upgradeToAnnual = (user) => createCheckout(user, 'yearly', 'pro');

// ── Server-to-server subscription management ──────────────────────────────────
async function getSubscription(user) {
  const sub = subscriptions.getByUser(user.id);
  if (!sub?.paddleSubscriptionId) return { ok: true, subscription: sub || null, remote: null };
  const res = await paddleApi('GET', `/subscriptions/${sub.paddleSubscriptionId}`);
  return { ok: res.ok, subscription: sub, remote: res.ok ? res.data : null, error: res.error };
}

/** Cancel at period end (keeps access until currentPeriodEnd). */
async function cancelSubscription(user) {
  const sub = subscriptions.getByUser(user.id);
  if (!sub?.paddleSubscriptionId) return { ok: false, error: 'No active subscription' };
  const res = await paddleApi('POST', `/subscriptions/${sub.paddleSubscriptionId}/cancel`, {
    effective_from: 'next_billing_period',
  });
  if (res.ok) subscriptions.upsert(user.id, { cancelAtPeriodEnd: true });
  return res;
}

/** Undo a scheduled cancellation / unpause. */
async function resumeSubscription(user) {
  const sub = subscriptions.getByUser(user.id);
  if (!sub?.paddleSubscriptionId) return { ok: false, error: 'No subscription to resume' };
  // Clearing the scheduled change resumes the subscription.
  const res = await paddleApi('PATCH', `/subscriptions/${sub.paddleSubscriptionId}`, {
    scheduled_change: null,
  });
  if (res.ok) subscriptions.upsert(user.id, { cancelAtPeriodEnd: false, status: 'active' });
  return res;
}

/** Switch billing cycle or plan (e.g. monthly → annual). */
async function changePlan(user, billingCycle, planSlug = 'pro') {
  const sub = subscriptions.getByUser(user.id);
  if (!sub?.paddleSubscriptionId) return { ok: false, error: 'No active subscription' };
  const priceId = getPriceId(planSlug, billingCycle);
  if (!priceId) return { ok: false, error: `No price for ${planSlug}/${billingCycle}` };
  const res = await paddleApi('PATCH', `/subscriptions/${sub.paddleSubscriptionId}`, {
    items: [{ price_id: priceId, quantity: 1 }],
    proration_billing_mode: 'prorated_immediately',
  });
  if (res.ok) subscriptions.upsert(user.id, { planSlug, billingCycle, paddlePriceId: priceId });
  return res;
}

/** Pull the live Paddle state and reconcile our local record. */
async function syncSubscription(user) {
  const sub = subscriptions.getByUser(user.id);
  if (!sub?.paddleSubscriptionId) return { ok: true, subscription: sub || null };
  const res = await paddleApi('GET', `/subscriptions/${sub.paddleSubscriptionId}`);
  if (!res.ok) return res;
  const d = res.data;
  const priceId = d.items?.[0]?.price?.id || sub.paddlePriceId;
  const resolved = plans.resolvePlanByPriceId(priceId);
  const updated = subscriptions.upsert(user.id, {
    status: d.status,
    paddlePriceId: priceId,
    paddleProductId: d.items?.[0]?.price?.product_id || sub.paddleProductId,
    planSlug: resolved?.plan?.slug || sub.planSlug,
    billingCycle: resolved?.billingCycle || sub.billingCycle,
    currentPeriodStart: d.current_billing_period?.starts_at ? Date.parse(d.current_billing_period.starts_at) : sub.currentPeriodStart,
    currentPeriodEnd: d.current_billing_period?.ends_at ? Date.parse(d.current_billing_period.ends_at) : sub.currentPeriodEnd,
    cancelAtPeriodEnd: d.scheduled_change?.action === 'cancel',
  });
  return { ok: true, subscription: updated };
}

/** Create a Paddle customer portal session (manage payment method, invoices…). */
async function getCustomerPortal(user) {
  const sub = subscriptions.getByUser(user.id);
  const customerId = sub?.paddleCustomerId || user.paddleCustomerId;
  if (!customerId) return { ok: false, error: 'No Paddle customer on file' };
  const res = await paddleApi('POST', `/customers/${customerId}/portal-sessions`, {});
  if (!res.ok) return res;
  return {
    ok: true,
    url: res.data?.urls?.general?.overview || res.data?.urls?.general || null,
    data: res.data,
  };
}

module.exports = {
  createCheckout,
  upgradeToMonthly,
  upgradeToAnnual,
  cancelSubscription,
  resumeSubscription,
  changePlan,
  getSubscription,
  syncSubscription,
  getCustomerPortal,
  paddleApi,
};
