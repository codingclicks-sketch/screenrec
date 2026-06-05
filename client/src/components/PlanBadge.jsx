import React from 'react';
import s from './Paywall.module.css';

// Small capability-aware plan chip. Renders by slug but stays generic so a future
// Business/Enterprise badge just needs a class — no logic change.
export default function PlanBadge({ slug = 'free', label }) {
  const cls =
    slug === 'pro' ? s.badgePro
    : slug === 'business' || slug === 'enterprise' ? s.badgeBusiness
    : s.badgeFree;
  return <span className={`${s.badge} ${cls}`}>{label || slug}</span>;
}
