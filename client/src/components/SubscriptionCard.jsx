import React from 'react';
import s from './Paywall.module.css';
import PlanBadge from './PlanBadge';

function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Current plan + subscription status, with the management actions.
export default function SubscriptionCard({ entitlements, onUpgrade, onCancel, onResume, onPortal, busy, comingSoon = false }) {
  if (!entitlements) return null;
  const { plan, planSlug, isPaid, subscription } = entitlements;
  const status = subscription?.status || (isPaid ? 'active' : null);
  const statusCls = status ? (s[`status${status.charAt(0).toUpperCase() + status.slice(1)}`] || s.statusActive) : '';

  return (
    <div className={s.scard}>
      <div className={s.scardHead}>
        <span className={s.scardTitle}>Subscription</span>
        <PlanBadge slug={planSlug} label={plan?.name} />
      </div>

      <div className={s.statRow}>
        <div className={s.statItem}>
          <span className={s.statLabel}>Plan</span>
          <span className={s.statValue}>{plan?.name} {isPaid && subscription?.billingCycle ? `· ${subscription.billingCycle}` : ''}</span>
        </div>
        {status && (
          <div className={s.statItem}>
            <span className={s.statLabel}>Status</span>
            <span className={`${s.statusPill} ${statusCls}`}>{status.replace('_', ' ')}</span>
          </div>
        )}
        {isPaid && (
          <div className={s.statItem}>
            <span className={s.statLabel}>{subscription?.cancelAtPeriodEnd ? 'Access until' : 'Renews on'}</span>
            <span className={s.statValue}>{fmtDate(subscription?.currentPeriodEnd)}</span>
          </div>
        )}
      </div>

      <div className={s.actionRow}>
        {!isPaid && (
          comingSoon
            ? <button className={`${s.btn}`} disabled>Pro — coming soon</button>
            : <button className={`${s.btn} ${s.btnPrimary}`} onClick={onUpgrade} disabled={busy}>Upgrade to Pro</button>
        )}
        {isPaid && (
          <>
            <button className={s.btn} onClick={onPortal} disabled={busy}>Manage billing</button>
            {subscription?.cancelAtPeriodEnd ? (
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={onResume} disabled={busy}>Resume subscription</button>
            ) : (
              <button className={`${s.btn} ${s.btnDanger}`} onClick={onCancel} disabled={busy}>Cancel subscription</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
