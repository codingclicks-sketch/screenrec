// Business analytics for the admin dashboard: revenue (from subscriptions),
// infra cost (from infra.config + live Cloudinary usage), profit/loss, free-tier
// limit alerts, and a pre-upgrade impact report (new cost, new P/L, break-even).
const plans = require('./plans');
const subscriptions = require('./subscriptions');
const { PLATFORMS } = require('./infra.config');

// Monthly recurring revenue from currently-entitled paid subscriptions.
function computeMRR() {
  let mrr = 0;
  for (const s of subscriptions.all()) {
    if (!subscriptions.isEntitled(s)) continue;
    const plan = plans.getPlan(s.planSlug);
    if (!plan) continue;
    mrr += s.billingCycle === 'yearly' ? (plan.yearlyPrice || 0) / 12 : (plan.monthlyPrice || 0);
  }
  return +mrr.toFixed(2);
}

function statusFor(pct) {
  if (pct == null) return 'unknown';
  if (pct >= 95) return 'critical';
  if (pct >= 80) return 'warning';
  return 'ok';
}

// usageByKey: { <platformKey>: { usage:number, source:string, detail?:object } }
// Anything not supplied falls back to the platform's `estimatedUsage` (or null).
function computeBusiness({ usageByKey = {}, totals = {} } = {}) {
  const pro = plans.getPlan('pro') || { monthlyPrice: 7.99 };
  const proPrice = pro.monthlyPrice || 7.99;
  const mrr = computeMRR();
  const payingSubscribers = subscriptions.all().filter((s) => subscriptions.isEntitled(s)).length;

  const platforms = PLATFORMS.map((p) => {
    const u = usageByKey[p.key] || {};
    const usage = u.usage != null ? u.usage : (p.estimatedUsage != null ? p.estimatedUsage : null);
    const pct = (p.freeLimit && usage != null) ? +((usage / p.freeLimit) * 100).toFixed(1) : null;
    return {
      key: p.key, name: p.name, what: p.what,
      metricLabel: p.metricLabel, metricHint: p.metricHint,
      currentTier: p.currentTier, monthlyCost: +(p.monthlyCost || 0).toFixed(2),
      freeLimit: p.freeLimit, usage,
      usagePct: pct,
      usageSource: u.source || (p.estimatedUsage != null ? 'estimate' : 'not measured'),
      usageDetail: u.detail || null,
      status: p.fixed ? 'fixed' : statusFor(pct),
      nextTier: p.nextTier || null,
      primary: !!p.primary,
    };
  });

  const monthlyCost = +platforms.reduce((a, p) => a + (p.monthlyCost || 0), 0).toFixed(2);
  const netProfit = +(mrr - monthlyCost).toFixed(2);
  const margin = mrr > 0 ? +((netProfit / mrr) * 100).toFixed(1) : null;
  const breakevenSubs = proPrice > 0 ? Math.ceil(monthlyCost / proPrice) : null;

  // Pre-upgrade impact: what each "move to next tier" does to cost & profit.
  const upgrades = platforms.filter((p) => p.nextTier).map((p) => {
    const extraCost = +((p.nextTier.monthlyCost || 0) - (p.monthlyCost || 0)).toFixed(2);
    const newMonthlyCost = +(monthlyCost + extraCost).toFixed(2);
    return {
      key: p.key, name: p.name,
      from: { tier: p.currentTier, cost: p.monthlyCost, limit: p.freeLimit, metricLabel: p.metricLabel },
      to: { tier: p.nextTier.name, cost: +(p.nextTier.monthlyCost || 0).toFixed(2), limit: p.nextTier.freeLimit },
      extraMonthlyCost: extraCost,
      extraAnnualCost: +(extraCost * 12).toFixed(2),
      newMonthlyCost,
      newNetProfit: +(mrr - newMonthlyCost).toFixed(2),
      breakevenSubsAfter: proPrice > 0 ? Math.ceil(newMonthlyCost / proPrice) : null,
      extraSubsToCover: proPrice > 0 ? Math.ceil(extraCost / proPrice) : null,
      recommended: p.status === 'critical' || p.status === 'warning',
    };
  });

  const alerts = platforms
    .filter((p) => p.status === 'warning' || p.status === 'critical')
    .sort((a, b) => (b.usagePct || 0) - (a.usagePct || 0))
    .map((p) => ({
      key: p.key, name: p.name, status: p.status, usagePct: p.usagePct,
      message: `${p.name} is at ${p.usagePct}% of its ${p.currentTier} free limit (${p.usage} / ${p.freeLimit} ${p.metricLabel}). Plan the upgrade to ${p.nextTier ? p.nextTier.name : 'a paid tier'} before it caps.`,
    }));

  return {
    revenue: { mrr, arr: +(mrr * 12).toFixed(2), payingSubscribers, proPrice },
    cost: { monthly: monthlyCost, annual: +(monthlyCost * 12).toFixed(2) },
    profit: { net: netProfit, annualNet: +(netProfit * 12).toFixed(2), margin, breakevenSubs },
    platforms, upgrades, alerts,
    totals,
    generatedAt: Date.now(),
  };
}

module.exports = { computeBusiness, computeMRR };
