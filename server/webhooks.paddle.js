// ─────────────────────────────────────────────────────────────────────────────
// PADDLE WEBHOOK HANDLER
//
// Source of truth for subscription state. Verifies the signature, then maps the
// event onto our Subscription store + flips the user's plan. Capability comes
// from the Subscription (resolved by entitlements.js) — we still also write a
// coarse `plan` slug on the user for back-compat and quick reads.
//
// Handled events:
//   subscription.created / .updated / .activated
//   subscription.canceled / .paused / .resumed
//   transaction.completed / .payment_failed
//   customer.created / .updated
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const { PADDLE } = require('./billing.config');
const plans = require('./plans');
const subscriptions = require('./subscriptions');

// Verify "paddle-signature: ts=...;h1=<hmac sha256 of `ts:rawBody`>"
function verifySignature(req) {
  if (!PADDLE.webhookSecret) return false;
  const header = req.headers['paddle-signature'];
  if (!header) return false;
  const parts = Object.fromEntries(String(header).split(';').map((kv) => kv.split('=')));
  if (!parts.ts || !parts.h1) return false;
  const signed = `${parts.ts}:${req.rawBody}`;
  const expected = crypto.createHmac('sha256', PADDLE.webhookSecret).update(signed).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.h1)); }
  catch { return false; }
}

// Pull our userId out of the event. Prefer custom_data (set at checkout), then
// fall back to matching a known paddle customer/subscription id.
function resolveUserId(data, usersRepo) {
  const fromCustom = data?.custom_data?.userId;
  if (fromCustom && usersRepo.findById(fromCustom)) return fromCustom;

  const subId = data?.id || data?.subscription_id;
  const bySub = subId && subscriptions.getByPaddleSubscriptionId(subId);
  if (bySub) return bySub.userId;

  const custId = data?.customer_id;
  const byCust = custId && subscriptions.getByPaddleCustomerId(custId);
  if (byCust) return byCust.userId;

  return null;
}

function periodMs(d, key) {
  const v = d?.current_billing_period?.[key];
  return v ? Date.parse(v) : null;
}

/**
 * @param {object} deps  { users } repository (findById/update)
 * @returns Express handler
 */
function makeHandler({ users }) {
  return function paddleWebhook(req, res) {
    if (!verifySignature(req)) return res.status(401).json({ error: 'bad signature' });

    const event = req.body || {};
    const type = event.event_type;
    const data = event.data || {};

    try {
      switch (type) {
        // ── Subscription lifecycle ───────────────────────────────────────────
        case 'subscription.created':
        case 'subscription.updated':
        case 'subscription.activated':
        case 'subscription.resumed': {
          const userId = resolveUserId(data, users);
          if (!userId) break;

          const priceId = data.items?.[0]?.price?.id || data.items?.[0]?.price_id;
          const resolved = plans.resolvePlanByPriceId(priceId);
          const planSlug = data.custom_data?.planSlug || resolved?.plan?.slug || 'pro';
          const billingCycle = data.custom_data?.billingCycle || resolved?.billingCycle || 'monthly';

          subscriptions.upsert(userId, {
            paddleSubscriptionId: data.id,
            paddleCustomerId: data.customer_id,
            paddleProductId: data.items?.[0]?.price?.product_id || null,
            paddlePriceId: priceId || null,
            planSlug,
            billingCycle,
            status: data.status || 'active',
            currentPeriodStart: periodMs(data, 'starts_at'),
            currentPeriodEnd: periodMs(data, 'ends_at'),
            cancelAtPeriodEnd: data.scheduled_change?.action === 'cancel',
          });

          // back-compat coarse flag + store paddle customer on the user
          users.update(userId, {
            plan: planSlug,
            planId: planSlug,
            paddleCustomerId: data.customer_id || undefined,
            plan_since: Date.now(),
          });
          break;
        }

        case 'subscription.paused': {
          const userId = resolveUserId(data, users);
          if (!userId) break;
          subscriptions.upsert(userId, { status: 'paused' });
          // Paused = no access. Drop to free.
          users.update(userId, { plan: 'free', planId: 'free' });
          break;
        }

        case 'subscription.canceled': {
          const userId = resolveUserId(data, users);
          if (!userId) break;
          subscriptions.upsert(userId, {
            status: 'canceled',
            cancelAtPeriodEnd: false,
            currentPeriodEnd: periodMs(data, 'ends_at'),
          });
          users.update(userId, { plan: 'free', planId: 'free' });
          break;
        }

        // ── Transactions ─────────────────────────────────────────────────────
        case 'transaction.completed': {
          const userId = resolveUserId(data, users);
          if (!userId) break;
          // A completed transaction confirms paid access. If a subscription
          // record exists it's already entitled; this is a safety net for
          // one-off / first payment ordering.
          const existing = subscriptions.getByUser(userId);
          if (!existing || !subscriptions.isEntitled(existing)) {
            const priceId = data.items?.[0]?.price?.id;
            const resolved = plans.resolvePlanByPriceId(priceId);
            subscriptions.upsert(userId, {
              paddleCustomerId: data.customer_id,
              paddleSubscriptionId: data.subscription_id || existing?.paddleSubscriptionId,
              paddlePriceId: priceId,
              planSlug: data.custom_data?.planSlug || resolved?.plan?.slug || 'pro',
              billingCycle: data.custom_data?.billingCycle || resolved?.billingCycle || 'monthly',
              status: 'active',
            });
            users.update(userId, { plan: 'pro', planId: 'pro', plan_since: Date.now() });
          }
          break;
        }

        case 'transaction.payment_failed': {
          const userId = resolveUserId(data, users);
          if (!userId) break;
          // Mark past_due — entitlements keeps a short grace so a single failed
          // charge doesn't instantly nuke access. A later .canceled revokes it.
          subscriptions.upsert(userId, { status: 'past_due' });
          break;
        }

        // ── Customer ─────────────────────────────────────────────────────────
        case 'customer.created':
        case 'customer.updated': {
          // Attach the paddle customer id to the matching local user by email.
          const email = data.email && String(data.email).toLowerCase();
          const u = email && users.findByEmail(email);
          if (u) users.update(u.id, { paddleCustomerId: data.id });
          break;
        }

        default:
          // Unhandled event — ack so Paddle doesn't retry forever.
          break;
      }
    } catch (e) {
      // Log but still 200 so Paddle doesn't hammer retries on a transient bug.
      console.error('[paddle webhook] error:', e.message);
    }

    res.json({ ok: true });
  };
}

module.exports = { makeHandler, verifySignature };
