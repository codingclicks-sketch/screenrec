import React from 'react';
import s from './Paywall.module.css';
import StorageMeter from './StorageMeter';
import UsageMeter from './UsageMeter';

// Usage-at-a-glance card: storage, videos, recording minutes vs plan limits.
export default function BillingCard({ usage, plan, isPaid }) {
  if (!usage || !plan) return null;
  return (
    <div className={s.scard}>
      <div className={s.scardHead}>
        <span className={s.scardTitle}>Usage</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <StorageMeter usage={usage} isPaid={isPaid} />
        <UsageMeter label="Videos recorded" used={usage.videoCount} limit={null} />
        <UsageMeter
          label="Recording length limit"
          used={plan.recordingLimitMinutes}
          limit={null}
          formatValue={(v) => `${v} min`}
        />
      </div>
    </div>
  );
}
