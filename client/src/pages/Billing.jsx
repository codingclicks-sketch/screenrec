import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useBilling } from '../hooks/useBilling';
import API from '../api';
import SubscriptionCard from '../components/SubscriptionCard';
import BillingCard from '../components/BillingCard';
import s from './Billing.module.css';

export default function Billing() {
  const { user, token, updateUser } = useAuth();
  const { entitlements, usage, plan, isPaid, refresh } = useBilling();
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const paddleReady = useRef(false);

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch(`${API}/api/billing/config`).then((r) => r.json()).then(setCfg).catch(() => setCfg({ enabled: false }));
  }, []);

  // Init Paddle.js once.
  useEffect(() => {
    if (!cfg?.enabled || paddleReady.current) return;
    function init() {
      if (!window.Paddle) return;
      window.Paddle.Environment.set(cfg.env === 'production' ? 'production' : 'sandbox');
      window.Paddle.Initialize({
        token: cfg.clientToken,
        eventCallback: (e) => {
          if (e.name === 'checkout.completed') { setMsg('⏳ Confirming your payment…'); pollForPro(); }
        },
      });
      paddleReady.current = true;
    }
    if (window.Paddle) return init();
    const sc = document.createElement('script');
    sc.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    sc.onload = init;
    document.body.appendChild(sc);
  }, [cfg]);

  function pollForPro(tries = 0) {
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((u) => {
        if (u.plan && u.plan !== 'free') { updateUser(u); setMsg('🎉 You’re on Pro now — thank you!'); refresh(); }
        else if (tries < 8) setTimeout(() => pollForPro(tries + 1), 1500);
        else setMsg('Payment received — your plan will update shortly.');
      })
      .catch(() => setMsg('Could not confirm. Refresh in a moment.'));
  }

  async function openCheckout(billingCycle = 'monthly') {
    if (!window.Paddle) { setMsg('Billing is still loading — try again in a second.'); return; }
    const res = await fetch(`${API}/api/billing/checkout`, {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ billingCycle }),
    });
    if (!res.ok) { setMsg('Could not start checkout.'); return; }
    const c = await res.json();
    window.Paddle.Checkout.open({
      items: [{ priceId: c.priceId, quantity: 1 }],
      customer: c.customer,
      customData: c.customData,
      settings: { displayMode: 'overlay', theme: 'light' },
    });
  }

  async function act(path, okMsg) {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${API}${path}`, { method: 'POST', headers: authHeaders });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || 'Something went wrong.'); return; }
      setMsg(okMsg);
      await refresh();
    } catch { setMsg('Network error.'); } finally { setBusy(false); }
  }

  async function openPortal() {
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/billing/portal`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.url) window.open(d.url, '_blank');
      else setMsg(d.error || 'Customer portal is not available yet.');
    } catch { setMsg('Could not open billing portal.'); } finally { setBusy(false); }
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <Link to="/" className={s.logo}><span className={s.dot} />VeoRec</Link>
        <Link to="/" className={s.back}>← Dashboard</Link>
      </header>

      <main className={s.main}>
        <h1 className={s.title}>Billing & plan</h1>
        <p className={s.sub}>Manage your subscription, usage and payment details.</p>

        {msg && <div className={s.banner}>{msg}</div>}
        {cfg && !cfg.enabled && (
          <div className={s.bannerWarn}>🚀 VeoRec Pro is coming soon — we’ll let you know the moment upgrades open. Your free plan is fully active.</div>
        )}

        <div className={s.cards}>
          <SubscriptionCard
            entitlements={entitlements}
            busy={busy}
            comingSoon={!cfg?.enabled}
            onUpgrade={() => openCheckout('monthly')}
            onCancel={() => act('/api/billing/cancel', 'Your subscription will cancel at the end of the period.')}
            onResume={() => act('/api/billing/resume', 'Welcome back — your subscription is active again.')}
            onPortal={openPortal}
          />
          <BillingCard usage={usage} plan={plan} isPaid={isPaid} />
        </div>

        {!isPaid && cfg?.enabled && (
          <div className={s.upgradeStrip}>
            <div>
              <strong>Go Pro</strong> — unlimited videos, unlimited recording length, 1080p, analytics & more.
            </div>
            <div className={s.upgradeBtns}>
              <button className={s.btnGhost} onClick={() => openCheckout('monthly')} disabled={busy}>$7.99/mo</button>
              <button className={s.btnPrimary} onClick={() => openCheckout('yearly')} disabled={busy}>$79/yr · 2 months free</button>
            </div>
          </div>
        )}

        <p className={s.legal}>
          Payments are processed securely by Paddle (our Merchant of Record).{' '}
          <Link to="/terms">Terms</Link> · <Link to="/refund">Refund Policy</Link> · <Link to="/pricing">Compare plans</Link>
        </p>
      </main>
    </div>
  );
}
