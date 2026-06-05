import React from 'react';
import { Link } from 'react-router-dom';
import s from './Paywall.module.css';

function fmtGB(bytes) {
  const gb = bytes / 1024 ** 3;
  if (gb < 0.1) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

// Storage is the primary free-plan limiter, so this meter is front-and-center.
// Turns amber at 80% (our conversion trigger) and red at 95%.
export default function StorageMeter({ usage, isPaid, showUpgradeHint = true }) {
  if (!usage) return null;
  const pct = Math.min(100, usage.storagePercent || 0);
  const fillCls = pct >= 95 ? s.fillDanger : pct >= 80 ? s.fillWarn : s.fill;
  return (
    <div className={s.meter}>
      <div className={s.meterHead}>
        <span className={s.meterLabel}>Storage</span>
        <span className={s.meterValue}>
          {fmtGB(usage.storageUsedBytes)} / {usage.storageLimitGB} GB
        </span>
      </div>
      <div className={s.track}>
        <div className={`${s.fill} ${fillCls}`} style={{ width: `${pct}%` }} />
      </div>
      {showUpgradeHint && !isPaid && pct >= 80 && (
        <p className={s.meterHint}>
          You’ve used {pct.toFixed(0)}% of your storage. <Link to="/pricing">Upgrade to Pro</Link> for 100 GB.
        </p>
      )}
    </div>
  );
}
