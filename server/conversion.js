// ─────────────────────────────────────────────────────────────────────────────
// CONVERSION TRACKING  —  records every moment a free user bumps into a paywall.
// This is the data that tells you WHICH limit drives upgrades. Append-only log
// in upgrade_events.json. Read by the admin dashboard (upgrade rate, top
// requested features).
// ─────────────────────────────────────────────────────────────────────────────
const { createLogStore } = require('./store');

const log = createLogStore('upgrade_events.json');

// Canonical trigger names — keep stable so analytics stay comparable over time.
const TRIGGERS = {
  STORAGE_80: 'storage_threshold_80',
  STORAGE_FULL: 'storage_limit_reached',
  RECORDING_LIMIT: 'recording_over_limit',
  ANALYTICS: 'analytics_attempted',
  THUMBNAIL: 'thumbnail_attempted',
  PASSWORD: 'password_protection_attempted',
  REMOVE_BRANDING: 'remove_branding_attempted',
  PRIORITY: 'priority_processing_attempted',
  ADVANCED_SHARING: 'advanced_sharing_attempted',
  PRICING_VIEW: 'pricing_viewed',
  CHECKOUT_OPEN: 'checkout_opened',
};

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.featureRequested  one of TRIGGERS (or any string)
 * @param {string} [p.userPlan]
 * @param {object} [p.meta]
 */
function track({ userId, featureRequested, userPlan = 'free', meta = {} }) {
  return log.append({
    userId: userId || null,
    featureRequested,
    userPlan,
    meta,
    timestamp: Date.now(),
  });
}

function all() { return log.all(); }

/** Aggregate counts by feature trigger, optionally within a time window. */
function summarize(sinceMs = 0) {
  const rows = log.filter((e) => e.timestamp >= sinceMs);
  const byFeature = {};
  for (const e of rows) byFeature[e.featureRequested] = (byFeature[e.featureRequested] || 0) + 1;
  return { total: rows.length, byFeature };
}

module.exports = { TRIGGERS, track, all, summarize };
