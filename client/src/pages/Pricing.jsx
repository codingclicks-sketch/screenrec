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
  const [cfg, setCfg] = useState(null);          // billing config
  const [status, setStatus] = useState('');      // 'success' | 'error' | ''
  const ppRef = useRef(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    fetch(`${API}/api/billing/config`).then(r => r.json()).then(setCfg).catch(() => setCfg({ enabled: false }));
  }, []);

  // Load PayPal SDK + render the button once we know billing is enabled
  useEffect(() => {
    if (!cfg || !cfg.enabled || !user || currentPlan === 'pro' || renderedRef.current) return;
    renderedRef.current = true;

    function renderButton() {
      if (!window.paypal || !ppRef.current) return;
      window.paypal.Buttons({
        style: { color: 'blue', shape: 'pill', label: 'pay', height: 44 },
        createOrder: async () => {
          const r = await fetch(`${API}/api/billing/paypal/create-order`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'create order failed');
          return d.id;
        },
        onApprove: async (data) => {
          const r = await fetch(`${API}/api/billing/paypal/capture`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ orderID: data.orderID }),
          });
          const d = await r.json();
          if (r.ok) { updateUser(d); setStatus('success'); }
          else setStatus('error');
        },
        onError: () => setStatus('error'),
      }).render(ppRef.current);
    }

    if (window.paypal) { renderButton(); return; }
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}&currency=USD`;
    s.onload = renderButton;
    document.body.appendChild(s);
  }, [cfg, user, currentPlan, token, updateUser]);

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

        {status === 'success' && <div className={styles.banner}>🎉 You’re on Pro now — thank you! Enjoy unlimited HD recording.</div>}
        {status === 'error' && <div className={styles.bannerErr}>Payment didn’t complete. Please try again.</div>}

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
                    {user && cfg && cfg.enabled && <div ref={ppRef} className={styles.paypal} />}
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
          <p className={styles.note}>⚠️ Test mode — use a PayPal sandbox account to try checkout.</p>
        )}
      </main>
    </div>
  );
}
