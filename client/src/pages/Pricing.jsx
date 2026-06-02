import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import API from '../api';
import styles from './Pricing.module.css';

const PLANS = [
  {
    id: 'free', name: 'Free', price: '$0', period: 'forever',
    tagline: 'Everything you need to start sharing.',
    features: ['Unlimited recordings', 'Up to 5 minutes per video', '720p quality', 'Shareable links', 'Screen + mic recording'],
  },
  {
    id: 'pro', name: 'Pro', price: '$9', period: 'per month', featured: true,
    tagline: 'For freelancers and teams who share daily.',
    features: ['Everything in Free', 'Unlimited recording length', '1080p HD quality', 'Custom branding', 'Password-protected videos', 'Viewer analytics', 'Priority support'],
  },
];

export default function Pricing() {
  const { user, token, updateUser } = useAuth();
  const currentPlan = user?.plan || (user ? 'free' : null);
  const [cfg, setCfg] = useState(null);
  const [status, setStatus] = useState('');   // '' | 'processing' | 'success' | 'error'
  const paddleRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/billing/config`).then(r => r.json()).then(setCfg).catch(() => setCfg({ enabled: false }));
  }, []);

  // Load + initialise Paddle.js once we know billing is enabled
  useEffect(() => {
    if (!cfg || !cfg.enabled || paddleRef.current) return;

    function init() {
      if (!window.Paddle) return;
      window.Paddle.Environment.set(cfg.env === 'production' ? 'production' : 'sandbox');
      window.Paddle.Initialize({
        token: cfg.clientToken,
        eventCallback: (e) => {
          if (e.name === 'checkout.completed') {
            setStatus('processing');
            // The webhook flips the account to Pro server-side; poll /me to reflect it.
            pollForPro();
          }
        },
      });
      paddleRef.current = true;
    }

    if (window.Paddle) { init(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.onload = init;
    document.body.appendChild(s);
  }, [cfg]);

  function pollForPro(tries = 0) {
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(u => {
        if (u.plan === 'pro') { updateUser(u); setStatus('success'); }
        else if (tries < 8) setTimeout(() => pollForPro(tries + 1), 1500);
        else setStatus('success'); // payment captured; plan will sync shortly
      })
      .catch(() => setStatus('error'));
  }

  function upgrade() {
    if (!window.Paddle || !cfg?.priceId) return;
    window.Paddle.Checkout.open({
      items: [{ priceId: cfg.priceId, quantity: 1 }],
      customer: user?.email ? { email: user.email } : undefined,
      customData: { userId: user?.id },
      settings: { displayMode: 'overlay', theme: 'light' },
    });
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

        {status === 'processing' && <div className={styles.banner}>⏳ Confirming your payment…</div>}
        {status === 'success' && <div className={styles.banner}>🎉 You’re on Pro now — thank you! Enjoy unlimited HD recording.</div>}
        {status === 'error' && <div className={styles.bannerErr}>Something went wrong confirming the payment. If you were charged, refresh in a moment.</div>}

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
                  {plan.features.map((f, i) => <li key={i}><span className={styles.check}>✓</span> {f}</li>)}
                </ul>

                {isCurrent ? (
                  <button className={styles.currentBtn} disabled>Current plan</button>
                ) : plan.id === 'pro' ? (
                  <>
                    {!user && <Link to="/login" className={styles.upgradeBtn}>Sign in to upgrade</Link>}
                    {user && cfg && cfg.enabled && (
                      <button className={styles.upgradeBtn} onClick={upgrade}>Upgrade to Pro</button>
                    )}
                    {user && cfg && !cfg.enabled && (
                      <button className={styles.upgradeBtn} disabled title="Billing is being set up">Coming soon</button>
                    )}
                    {user && !cfg && <button className={styles.upgradeBtn} disabled>Loading…</button>}
                  </>
                ) : (
                  <Link to={user ? '/' : '/signup'} className={styles.freeBtn}>Get started</Link>
                )}
              </div>
            );
          })}
        </div>

        {cfg && cfg.env === 'sandbox' && cfg.enabled && (
          <p className={styles.note}>⚠️ Test mode — use Paddle’s sandbox test card to try checkout.</p>
        )}
      </main>
    </div>
  );
}
