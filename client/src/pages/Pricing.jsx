import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import API from '../api';
import PricingTable from '../components/PricingTable';
import styles from './Pricing.module.css';

export default function Pricing() {
  const { user, token, updateUser } = useAuth();
  const currentSlug = user?.plan || 'free';
  const [plans, setPlans] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [status, setStatus] = useState('');   // '' | 'processing' | 'success' | 'error'
  const paddleRef = useRef(null);

  // Load capability-driven plans + billing config.
  useEffect(() => {
    fetch(`${API}/api/plans`).then((r) => r.json()).then((d) => setPlans(d.plans || [])).catch(() => setPlans([]));
    fetch(`${API}/api/billing/config`).then((r) => r.json()).then(setCfg).catch(() => setCfg({ enabled: false }));
    // record a pricing view for conversion analytics
    if (token) {
      fetch(`${API}/api/events/upgrade-intent`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureRequested: 'pricing_viewed' }),
      }).catch(() => {});
    }
  }, [token]);

  // Init Paddle.js once billing is enabled.
  useEffect(() => {
    if (!cfg || !cfg.enabled || paddleRef.current) return;
    function init() {
      if (!window.Paddle) return;
      window.Paddle.Environment.set(cfg.env === 'production' ? 'production' : 'sandbox');
      window.Paddle.Initialize({
        token: cfg.clientToken,
        eventCallback: (e) => { if (e.name === 'checkout.completed') { setStatus('processing'); pollForPro(); } },
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
      .then((r) => r.json())
      .then((u) => {
        if (u.plan && u.plan !== 'free') { updateUser(u); setStatus('success'); }
        else if (tries < 8) setTimeout(() => pollForPro(tries + 1), 1500);
        else setStatus('pending'); // don't claim success until the plan actually flips
      })
      .catch(() => setStatus('error'));
  }

  const comingSoon = !cfg || cfg.comingSoon || !cfg.enabled;

  async function handleSelect(planSlug, billingCycle) {
    if (planSlug === 'free') { window.location.href = user ? '/' : '/signup'; return; }
    if (!user) { window.location.href = '/login'; return; }
    if (comingSoon || !window.Paddle) { setStatus('soon'); return; }
    const res = await fetch(`${API}/api/billing/checkout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingCycle }),
    });
    if (!res.ok) { setStatus('error'); return; }
    const c = await res.json();
    window.Paddle.Checkout.open({
      items: [{ priceId: c.priceId, quantity: 1 }],
      customer: c.customer,
      customData: c.customData,
      settings: { displayMode: 'overlay', theme: 'light' },
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}><span className={styles.dot} />VeoRec</Link>
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
        {status === 'pending' && <div className={styles.banner}>Payment received — your plan will update shortly. Refresh in a moment.</div>}
        {status === 'soon' && <div className={styles.banner}>🚀 VeoRec Pro is launching soon — we’ll let you know the moment it’s live. The free plan is fully available right now.</div>}
        {status === 'error' && <div className={styles.bannerErr}>Something went wrong. If you were charged, refresh in a moment.</div>}

        <PricingTable
          plans={plans}
          currentSlug={currentSlug}
          onSelect={handleSelect}
          comingSoon={comingSoon}
        />

        {cfg && cfg.env === 'sandbox' && cfg.enabled && (
          <p className={styles.note}>⚠️ Test mode — use Paddle’s sandbox test card to try checkout.</p>
        )}
        {comingSoon && (
          <p className={styles.note}>VeoRec Pro is coming soon. Every feature is currently free while we finish payments — no card needed.</p>
        )}

        <footer className={styles.legalFooter}>
          VeoRec Pro is billed by Paddle, our Merchant of Record.
          <span>
            <Link to="/terms">Terms</Link> · <Link to="/refund">Refund Policy</Link> · <Link to="/privacy">Privacy</Link> · <a href="mailto:codingclicks@gmail.com">Contact</a>
          </span>
        </footer>
      </main>
    </div>
  );
}
