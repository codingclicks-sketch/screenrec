import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import s from './Paywall.module.css';

// Capability-driven pricing table. Feature rows are derived from each plan's
// `features` map + limits returned by /api/plans — nothing hardcoded per plan.
function featureRows(plan) {
  const f = plan.features || {};
  return [
    { label: 'Unlimited videos', on: true },
    { label: `Up to ${plan.recordingLimitMinutes >= 60 ? `${plan.recordingLimitMinutes / 60}-hour` : `${plan.recordingLimitMinutes}-min`} recordings`, on: true },
    { label: `${plan.storageLimitGB} GB storage`, on: true },
    { label: `${plan.exportQuality} exports`, on: true },
    { label: 'Remove VeoRec branding', on: !!f.removeBrandingEnabled },
    { label: 'Viewer analytics', on: !!f.analyticsEnabled },
    { label: 'Custom thumbnails', on: !!f.customThumbnailEnabled },
    { label: 'Password-protected videos', on: !!f.passwordProtectedVideosEnabled },
    { label: 'Priority processing', on: !!f.priorityProcessingEnabled },
    { label: 'Advanced sharing controls', on: !!f.advancedSharingEnabled },
  ];
}

export default function PricingTable({ plans = [], currentSlug = 'free', onSelect, billingDefault = 'monthly', loading }) {
  const [cycle, setCycle] = useState(billingDefault);

  return (
    <div>
      <div style={{ textAlign: 'center' }}>
        <div className={s.cycleToggle}>
          <button className={`${s.cycleBtn} ${cycle === 'monthly' ? s.cycleActive : ''}`} onClick={() => setCycle('monthly')}>
            Monthly
          </button>
          <button className={`${s.cycleBtn} ${cycle === 'yearly' ? s.cycleActive : ''}`} onClick={() => setCycle('yearly')}>
            Annual <span className={s.cycleSave}>2 months free</span>
          </button>
        </div>
      </div>

      <div className={s.grid}>
        {plans.map((plan) => {
          const isCurrent = plan.slug === currentSlug;
          const isPro = plan.slug === 'pro';
          const price = plan.slug === 'free' ? 0 : (cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice);
          const period = plan.slug === 'free' ? 'forever' : (cycle === 'yearly' ? 'per year' : 'per month');
          const rows = featureRows(plan);
          return (
            <div key={plan.slug} className={`${s.card} ${isPro ? s.cardFeatured : ''}`}>
              {isPro && plan.badge && <span className={s.popular}>{plan.badge}</span>}
              <h3 className={s.planName}>{plan.name}</h3>
              <p className={s.planTag}>
                {plan.slug === 'free' ? 'Everything you need to start sharing.' : 'For freelancers, agencies & teams who share daily.'}
              </p>
              <div className={s.priceRow}>
                <span className={s.priceAmount}>${price}</span>
                <span className={s.pricePeriod}>/{period}</span>
              </div>
              <div className={s.priceSub}>
                {isPro && cycle === 'yearly' ? `${plan.yearlyBadge} · just $${(plan.yearlyPrice / 12).toFixed(2)}/mo` : ' '}
              </div>

              <ul className={s.featureList}>
                {rows.map((r, i) => (
                  <li key={i} className={r.on ? '' : s.featureMuted}>
                    <span className={s.check}>{r.on ? '✓' : '–'}</span> {r.label}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <button className={`${s.planBtn} ${s.planBtnCurrent}`} disabled>Current plan</button>
              ) : plan.slug === 'free' ? (
                <Link to="/signup" className={`${s.planBtn} ${s.planBtnGhost}`}>Get started</Link>
              ) : (
                <button
                  className={`${s.planBtn} ${s.planBtnPrimary}`}
                  disabled={loading}
                  onClick={() => onSelect?.(plan.slug, cycle)}
                >
                  {loading ? 'Loading…' : `Upgrade to ${plan.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
