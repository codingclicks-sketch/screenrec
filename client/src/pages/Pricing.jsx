import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import styles from './Pricing.module.css';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    tagline: 'Everything you need to start sharing.',
    features: [
      'Unlimited recordings',
      'Up to 5 minutes per video',
      '720p quality',
      'Shareable links',
      'Screen + mic recording',
    ],
    cta: 'Current plan',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9',
    period: 'per month',
    tagline: 'For freelancers and teams who share daily.',
    featured: true,
    features: [
      'Everything in Free',
      'Unlimited recording length',
      '1080p HD quality',
      'Custom branding on share pages',
      'Password-protected videos',
      'Viewer analytics',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
  },
];

export default function Pricing() {
  const { user } = useAuth();
  const currentPlan = user?.plan || (user ? 'free' : null);

  function handleUpgrade(planId) {
    if (planId === 'pro') {
      // Billing isn't wired up yet — route the interest to email for now.
      window.location.href =
        'mailto:codingclicks@gmail.com?subject=ScreenRec%20Pro%20upgrade&body=I%27d%20like%20to%20upgrade%20to%20Pro.';
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}><span className={styles.dot} />ScreenRec</Link>
        <div className={styles.headerRight}>
          {user
            ? <Link to="/" className="btn-ghost" style={{ fontSize: 13 }}>← Dashboard</Link>
            : <Link to="/login" className="btn-ghost" style={{ fontSize: 13 }}>Sign in</Link>}
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Simple, honest pricing</h1>
        <p className={styles.sub}>Start free. Upgrade when you need more.</p>

        <div className={styles.grid}>
          {PLANS.map(plan => {
            const isCurrent = currentPlan === plan.id;
            return (
              <div key={plan.id} className={`${styles.card} ${plan.featured ? styles.featured : ''}`}>
                {plan.featured && <div className={styles.badge}>Most popular</div>}
                <h2 className={styles.planName}>{plan.name}</h2>
                <div className={styles.price}>
                  <span className={styles.amount}>{plan.price}</span>
                  <span className={styles.period}>/{plan.period}</span>
                </div>
                <p className={styles.tagline}>{plan.tagline}</p>
                <ul className={styles.features}>
                  {plan.features.map((f, i) => (
                    <li key={i}><span className={styles.check}>✓</span> {f}</li>
                  ))}
                </ul>
                {isCurrent ? (
                  <button className={styles.currentBtn} disabled>Current plan</button>
                ) : plan.id === 'pro' ? (
                  <button className={styles.upgradeBtn} onClick={() => handleUpgrade('pro')}>
                    {plan.cta}
                  </button>
                ) : (
                  <Link to={user ? '/' : '/signup'} className={styles.freeBtn}>Get started</Link>
                )}
              </div>
            );
          })}
        </div>

        <p className={styles.note}>
          Pro billing is launching soon. Click “Upgrade” to register your interest and
          we’ll reach out the moment it’s live.
        </p>
      </main>
    </div>
  );
}
