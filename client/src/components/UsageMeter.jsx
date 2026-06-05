import React from 'react';
import s from './Paywall.module.css';

// Generic labelled meter for any usage stat (videos, recording minutes, etc.).
export default function UsageMeter({ label, used, limit, unit = '', formatValue }) {
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const pct = hasLimit ? Math.min(100, (used / limit) * 100) : 0;
  const fillCls = pct >= 95 ? s.fillDanger : pct >= 80 ? s.fillWarn : s.fill;
  const fmt = formatValue || ((v) => `${v}${unit}`);
  return (
    <div className={s.meter}>
      <div className={s.meterHead}>
        <span className={s.meterLabel}>{label}</span>
        <span className={s.meterValue}>
          {fmt(used)}{hasLimit ? ` / ${fmt(limit)}` : ''}
        </span>
      </div>
      {hasLimit && (
        <div className={s.track}>
          <div className={`${s.fill} ${fillCls}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
