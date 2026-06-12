import React, { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users as UsersIcon, CreditCard, Mail, DollarSign,
  TrendingUp, HardDrive, Video, UserCheck, RefreshCw, Crown, Ban, Save, RotateCcw,
  UserPlus, Trash2, X, ArchiveRestore, Wallet, AlertTriangle, ArrowUpRight, Server,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import API from '../api';
import s from './Admin.module.css';

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

const TABS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'business', label: 'Costs & profit', Icon: Wallet },
  { id: 'users', label: 'Users', Icon: UsersIcon },
  { id: 'plans', label: 'Plans & pricing', Icon: CreditCard },
  { id: 'contacts', label: 'Messages', Icon: Mail },
];

export default function Admin() {
  const { user, token, loading } = useAuth();
  const [tab, setTab] = useState('overview');
  const [forbidden, setForbidden] = useState(false);

  const authGet = useCallback((path) =>
    fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { if (r.status === 403) { setForbidden(true); throw new Error('forbidden'); } return r.json(); }),
    [token]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (forbidden || user.isAdmin === false) {
    return <div className={s.page}><div className={s.denied}><Ban size={40} color="#b91c1c" /><h2>Admin access only</h2><p>Your account isn’t on the admin allowlist.</p><Link to="/">← Back to app</Link></div></div>;
  }

  return (
    <div className={s.page}>
      <aside className={s.sidebar}>
        <Link to="/" className={s.brand}><img src="/logo.png" alt="" />VeoRec <span className={s.adminTag}>Admin</span></Link>
        <nav className={s.nav}>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? s.navActive : s.navItem} onClick={() => setTab(t.id)}>
              <t.Icon size={18} /> {t.label}
            </button>
          ))}
        </nav>
        <Link to="/" className={s.backApp}>← Back to app</Link>
      </aside>

      <main className={s.content}>
        {tab === 'overview' && <Overview authGet={authGet} />}
        {tab === 'business' && <Business authGet={authGet} />}
        {tab === 'users' && <UsersTab token={token} authGet={authGet} />}
        {tab === 'plans' && <PlansTab token={token} authGet={authGet} />}
        {tab === 'contacts' && <ContactsTab token={token} authGet={authGet} />}
      </main>
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
function Overview({ authGet }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { authGet('/api/admin/metrics').then(setD).catch((e) => e.message !== 'forbidden' && setErr(e.message)); }, [authGet]);
  if (err) return <div className={s.err}>{err}</div>;
  if (!d) return <p className={s.muted}>Loading metrics…</p>;

  const stats = [
    { label: 'MRR', value: money(d.mrr), Icon: DollarSign, color: '#16a34a' },
    { label: 'Annual revenue', value: money(d.annualRevenue), Icon: TrendingUp, color: '#16a34a' },
    { label: 'Total users', value: d.totalUsers, Icon: UsersIcon, color: '#6366f1' },
    { label: 'Paid users', value: d.paidUsers, Icon: UserCheck, color: '#6366f1' },
    { label: 'Free users', value: d.freeUsers, Icon: UsersIcon, color: '#8a8aa0' },
    { label: 'Active (30d)', value: d.activeUsers, Icon: TrendingUp, color: '#6366f1' },
    { label: 'Upgrade rate', value: `${d.upgradeRate}%`, Icon: TrendingUp, color: '#ec4899' },
    { label: 'Churn rate', value: `${d.churnRate}%`, Icon: RefreshCw, color: d.churnRate > 5 ? '#dc2626' : '#8a8aa0' },
    { label: 'Videos uploaded', value: d.videosUploaded, Icon: Video, color: '#f59e0b' },
    { label: 'Storage used', value: `${d.storageConsumedGB} GB`, Icon: HardDrive, color: '#f59e0b' },
  ];

  return (
    <>
      <h1 className={s.h1}>Overview</h1>
      <div className={s.statGrid}>
        {stats.map((st, i) => (
          <div key={i} className={s.statCard}>
            <div className={s.statIcon} style={{ background: `${st.color}1a` }}><st.Icon size={20} color={st.color} /></div>
            <div><div className={s.statValue}>{st.value}</div><div className={s.statLabel}>{st.label}</div></div>
          </div>
        ))}
      </div>

      <div className={s.cols}>
        <Panel title="Top storage users">
          {d.topStorageUsers.map((u) => <Row key={u.id} a={u.email} b={gb(u.bytes)} />)}
          {!d.topStorageUsers.length && <p className={s.muted}>No data yet</p>}
        </Panel>
        <Panel title="Most active users">
          {d.mostActiveUsers.map((u) => <Row key={u.id} a={u.email} b={`${u.videos} videos`} />)}
          {!d.mostActiveUsers.length && <p className={s.muted}>No data yet</p>}
        </Panel>
      </div>

      <Panel title={`Upgrade triggers (30d) · ${d.conversionEvents.total} events`}>
        {Object.entries(d.conversionEvents.byFeature).sort((a, b) => b[1] - a[1]).map(([f, c]) => (
          <Row key={f} a={f.replace(/_/g, ' ')} b={c} />
        ))}
        {!d.conversionEvents.total && <p className={s.muted}>No paywall events yet</p>}
      </Panel>
    </>
  );
}

/* ── Business: costs, profit/loss, free-tier alerts, upgrade impact ─────────── */
const PLAT_ICON = { cloudinary: HardDrive, railway: Server, vercel: TrendingUp, brevo: Mail, domain: DollarSign };
const fmtUsage = (v) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));

function Business({ authGet }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { setErr(''); authGet('/api/admin/business').then(setD).catch((e) => e.message !== 'forbidden' && setErr(e.message)); }, [authGet]);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className={s.err}>{err}</div>;
  if (!d) return <p className={s.muted}>Crunching the numbers…</p>;

  const net = d.profit.net;
  const profitable = net >= 0;

  return (
    <>
      <div className={s.headRow}>
        <h1 className={s.h1}>Costs &amp; profit</h1>
        <button className={s.smBtn} onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* Alerts first — what needs attention */}
      {d.alerts.length > 0 && (
        <div className={s.bizAlerts}>
          {d.alerts.map((a) => (
            <div key={a.key} className={`${s.bizAlert} ${a.status === 'critical' ? s.bizAlertCrit : s.bizAlertWarn}`}>
              <AlertTriangle size={18} />
              <span>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* P&L summary */}
      <div className={s.pnlGrid}>
        <div className={s.pnlCard}>
          <div className={s.pnlLabel}><DollarSign size={15} /> Revenue (MRR)</div>
          <div className={s.pnlBig}>{money(d.revenue.mrr)}</div>
          <div className={s.pnlSub}>{money(d.revenue.arr)}/yr · {d.revenue.payingSubscribers} paying</div>
        </div>
        <div className={s.pnlCard}>
          <div className={s.pnlLabel}><Wallet size={15} /> Infra cost</div>
          <div className={s.pnlBig}>{money(d.cost.monthly)}<span className={s.pnlUnit}>/mo</span></div>
          <div className={s.pnlSub}>{money(d.cost.annual)}/yr</div>
        </div>
        <div className={`${s.pnlCard} ${profitable ? s.pnlCardPos : s.pnlCardNeg}`}>
          <div className={s.pnlLabel}>{profitable ? <TrendingUp size={15} /> : <AlertTriangle size={15} />} Net {profitable ? 'profit' : 'loss'}</div>
          <div className={`${s.pnlBig} ${profitable ? s.pnlPos : s.pnlNeg}`}>{profitable ? '' : '−'}{money(Math.abs(net))}<span className={s.pnlUnit}>/mo</span></div>
          <div className={s.pnlSub}>{d.profit.margin != null ? `${d.profit.margin}% margin` : 'pre-revenue'}</div>
        </div>
        <div className={s.pnlCard}>
          <div className={s.pnlLabel}><UserCheck size={15} /> Break-even</div>
          <div className={s.pnlBig}>{d.profit.breakevenSubs}<span className={s.pnlUnit}> Pro subs</span></div>
          <div className={s.pnlSub}>at {money(d.revenue.proPrice)}/mo each covers all infra</div>
        </div>
      </div>

      {/* Per-platform usage vs free limit */}
      <h2 className={s.bizSection}>Resource usage by platform</h2>
      <div className={s.platGrid}>
        {d.platforms.map((p) => {
          const Icon = PLAT_ICON[p.key] || HardDrive;
          const barCls = p.status === 'critical' ? s.barCrit : p.status === 'warning' ? s.barWarn : p.status === 'ok' ? s.barOk : s.barUnknown;
          return (
            <div key={p.key} className={s.platCard}>
              <div className={s.platTop}>
                <span className={s.platIcon}><Icon size={16} /></span>
                <div className={s.platHeadText}>
                  <strong>{p.name}</strong>
                  <small>{p.what}</small>
                </div>
                <span className={`${s.badge} ${p.monthlyCost > 0 ? s.badgePro : s.badgeFree}`}>{p.currentTier}{p.monthlyCost > 0 ? ` · ${money(p.monthlyCost)}/mo` : ' · free'}</span>
              </div>

              {p.freeLimit != null ? (
                <>
                  <div className={s.platUsageRow}>
                    <span className={s.mono}>{fmtUsage(p.usage)} / {fmtUsage(p.freeLimit)} {p.metricLabel}</span>
                    <span className={`${s.platPct} ${p.status === 'critical' ? s.pnlNeg : p.status === 'warning' ? s.warnText : ''}`}>{p.usagePct != null ? `${p.usagePct}%` : '—'}</span>
                  </div>
                  <div className={s.bar}><div className={`${s.barFill} ${barCls}`} style={{ width: `${Math.min(100, p.usagePct || 0)}%` }} /></div>
                </>
              ) : (
                <div className={s.platUsageRow}><span className={s.muted}>Fixed cost — no usage limit</span></div>
              )}

              <div className={s.srcNote}>{p.metricHint} · <em>{p.usageSource}</em></div>
            </div>
          );
        })}
      </div>

      {/* Pre-upgrade impact report */}
      <h2 className={s.bizSection}>Before you upgrade — impact on profit</h2>
      <p className={s.muted} style={{ margin: '0 0 14px' }}>What each platform upgrade costs and how many {money(d.revenue.proPrice)} Pro subscribers it takes to stay break-even.</p>
      <div className={s.upGrid}>
        {d.upgrades.map((u) => (
          <div key={u.key} className={`${s.upCard} ${u.recommended ? s.upRec : ''}`}>
            <div className={s.upHead}>
              <strong>{u.name}</strong>
              {u.recommended && <span className={s.recBadge}>Recommended soon</span>}
            </div>
            <div className={s.upMove}>
              <span className={s.badge + ' ' + s.badgeFree}>{u.from.tier}</span>
              <ArrowUpRight size={15} />
              <span className={s.badge + ' ' + s.badgePro}>{u.to.tier} · {money(u.to.cost)}/mo</span>
            </div>
            <div className={s.upRows}>
              <Row a="Extra cost" b={`+${money(u.extraMonthlyCost)}/mo (${money(u.extraAnnualCost)}/yr)`} />
              <Row a="New infra total" b={`${money(u.newMonthlyCost)}/mo`} />
              <Row a="New net profit" b={<span className={u.newNetProfit >= 0 ? s.pnlPos : s.pnlNeg}>{u.newNetProfit >= 0 ? '' : '−'}{money(Math.abs(u.newNetProfit))}/mo</span>} />
              <Row a="Extra Pro subs to cover" b={`${u.extraSubsToCover}`} />
              <Row a="Total subs to break even" b={`${u.breakevenSubsAfter}`} />
            </div>
          </div>
        ))}
      </div>

      <p className={s.muted} style={{ marginTop: 18, fontSize: 12 }}>
        Cloudinary usage is live from its API; other figures are tunable estimates (set <code>RAILWAY_MONTHLY_COST</code>, <code>VERCEL_EST_GB</code>, etc. in the server env as real bills come in).
      </p>
    </>
  );
}

/* ── Users ────────────────────────────────────────────────────────────────── */
function UsersTab({ token, authGet }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(() => authGet(`/api/admin/users?q=${encodeURIComponent(q)}`).then((d) => setRows(d.users)).catch(() => {}), [authGet, q]);
  useEffect(() => { load(); }, [load]);

  async function setPlan(id, planSlug, days) {
    setBusy(id);
    try {
      await fetch(`${API}/api/admin/users/${id}/plan`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug, days: days ? Number(days) : undefined }),
      });
      await load();
    } finally { setBusy(''); }
  }

  async function remove(u) {
    if (!window.confirm(`Delete ${u.name || u.email}? This permanently removes their account.`)) return;
    setBusy(u.id);
    try {
      const r = await fetch(`${API}/api/admin/users/${u.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'Could not delete user'); return; }
      await load();
    } finally { setBusy(''); }
  }

  return (
    <>
      <div className={s.headRow}>
        <h1 className={s.h1}>Users {rows ? `(${rows.length})` : ''}</h1>
        <div className={s.headActions}>
          <input className={s.search} placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className={`${s.smBtn} ${s.smPrimary}`} onClick={() => setShowInvite(true)}><UserPlus size={15} /> Invite user</button>
        </div>
      </div>
      {!rows ? <p className={s.muted}>Loading…</p> : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>User</th><th>Plan</th><th>Storage</th><th>Videos</th><th>Joined</th><th>Billing / grant</th><th></th></tr></thead>
            <tbody>
              {rows.map((u) => <UserRow key={u.id} u={u} busy={busy === u.id} onSet={setPlan} onDelete={remove} />)}
              {!rows.length && <tr><td colSpan={7} className={s.muted}>No users found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {showInvite && <InviteModal token={token} onClose={() => setShowInvite(false)} onCreated={() => { setShowInvite(false); load(); }} />}
    </>
  );
}

function UserRow({ u, busy, onSet, onDelete }) {
  const [days, setDays] = useState('');
  const planBadge = u.planSlug === 'free'
    ? <span className={`${s.badge} ${s.badgeFree}`}>Free</span>
    : <span className={`${s.badge} ${s.badgePro}`}><Crown size={12} /> {u.planSlug}{u.comped ? ' · comped' : ''}</span>;
  return (
    <tr>
      <td>
        <div className={s.userCell}>
          <span className={s.avatar}>{(u.name || u.email || '?')[0].toUpperCase()}</span>
          <div><strong>{u.name || '—'}</strong><small>{u.email}{u.isAdmin ? ' · admin' : ''}</small></div>
        </div>
      </td>
      <td>{planBadge}<div className={s.subMeta}>{
        u.source === 'subscription' ? `${u.subscriptionStatus}${u.billingCycle ? ' · ' + u.billingCycle : ''}`
          : u.comped ? 'comped' : 'free'
      }</div></td>
      <td>{gb(u.storageUsedBytes)}</td>
      <td>{u.videoCount}</td>
      <td className={s.nowrap}>{fmtDate(u.createdAt)}</td>
      <td>
        {u.source === 'subscription' ? (
          // Real Paddle subscriber — show the billing period (managed by Paddle, not granted here).
          <div className={s.subInfo}>
            <span className={`${s.badge} ${s.badgePro}`} style={{ gap: 4 }}>Paddle</span>
            <span className={s.subMeta} style={{ margin: 0 }}>
              {u.cancelAtPeriodEnd ? 'Ends ' : 'Renews '}{fmtDate(u.currentPeriodEnd)}
            </span>
          </div>
        ) : (
          <div className={s.grantRow}>
            {u.comped ? (
              <>
                <span className={s.subMeta} style={{ margin: 0 }}>{u.manualPlanExpires ? `until ${fmtDate(u.manualPlanExpires)}` : 'forever'}</span>
                <button className={`${s.smBtn} ${s.smDanger}`} disabled={busy} onClick={() => onSet(u.id, 'free')}><Ban size={13} /> Revoke</button>
              </>
            ) : (
              <>
                <input className={s.daysInput} placeholder="∞ days" value={days} onChange={(e) => setDays(e.target.value)} title="Optional: days until it expires (blank = forever)" />
                <button className={`${s.smBtn} ${s.smPrimary}`} disabled={busy} onClick={() => onSet(u.id, 'pro', days)}><Crown size={13} /> Grant Pro</button>
              </>
            )}
          </div>
        )}
      </td>
      <td>
        {!u.isAdmin && (
          <button className={s.iconBtn} title="Delete user" disabled={busy} onClick={() => onDelete(u)}><Trash2 size={15} /></button>
        )}
      </td>
    </tr>
  );
}

function InviteModal({ token, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', email: '', mode: 'invite', password: '', planSlug: 'free' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const body = {
        name: f.name, email: f.email, planSlug: f.planSlug,
        sendInvite: f.mode === 'invite',
        password: f.mode === 'password' ? f.password : undefined,
      };
      const r = await fetch(`${API}/api/admin/users`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Could not create user'); return; }
      if (f.mode === 'invite' && !d.invited) {
        alert('User created, but the invite email could not be sent (email service not configured). Share a password reset link with them, or set a password manually.');
      }
      onCreated();
    } catch { setErr('Network error'); } finally { setBusy(false); }
  }

  return (
    <div className={s.modalBg} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}><strong>Invite / create user</strong><button className={s.iconBtn} onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={submit} className={s.modalForm}>
          {err && <div className={s.err}>{err}</div>}
          <label className={s.field}><span>Name</span><input required value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" /></label>
          <label className={s.field}><span>Email</span><input required type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="user@example.com" /></label>
          <label className={s.field}><span>Plan</span>
            <select value={f.planSlug} onChange={(e) => set('planSlug', e.target.value)}>
              <option value="free">Free</option><option value="pro">Pro (comped)</option><option value="business">Business (comped)</option>
            </select>
          </label>
          <label className={s.field}><span>Access</span>
            <select value={f.mode} onChange={(e) => set('mode', e.target.value)}>
              <option value="invite">Email an invite link (they set their own password)</option>
              <option value="password">Set a password now</option>
            </select>
          </label>
          {f.mode === 'password' && (
            <label className={s.field}><span>Password</span><input type="text" minLength={6} required value={f.password} onChange={(e) => set('password', e.target.value)} placeholder="Min 6 characters" /></label>
          )}
          <div className={s.modalActions}>
            <button type="button" className={s.smBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={`${s.smBtn} ${s.smPrimary}`} disabled={busy}><UserPlus size={14} /> {busy ? 'Creating…' : 'Create user'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Plans & pricing ──────────────────────────────────────────────────────── */
function PlansTab({ token, authGet }) {
  const [plans, setPlans] = useState(null);
  const load = useCallback(() => authGet('/api/admin/plans').then((d) => setPlans(d.plans)).catch(() => {}), [authGet]);
  useEffect(() => { load(); }, [load]);
  if (!plans) return <p className={s.muted}>Loading…</p>;
  return (
    <>
      <h1 className={s.h1}>Plans &amp; pricing</h1>
      <p className={s.muted} style={{ marginBottom: 18 }}>Edit prices, limits and features live — changes apply instantly, no deploy needed. Paddle price IDs are managed in Paddle, not here.</p>
      <div className={s.planGrid}>
        {plans.map((p) => <PlanEditor key={p.slug} plan={p} token={token} onSaved={load} />)}
      </div>
    </>
  );
}

function PlanEditor({ plan, token, onSaved }) {
  const [f, setF] = useState({
    name: plan.name, monthlyPrice: plan.monthlyPrice ?? 0, yearlyPrice: plan.yearlyPrice ?? 0,
    storageLimitGB: plan.storageLimitGB, recordingLimitMinutes: plan.recordingLimitMinutes,
    exportQuality: plan.exportQuality, purchasable: plan.purchasable,
  });
  const [feat, setFeat] = useState({ ...plan.features });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${API}/api/admin/plans/${plan.slug}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name, monthlyPrice: Number(f.monthlyPrice), yearlyPrice: Number(f.yearlyPrice),
          storageLimitGB: Number(f.storageLimitGB), recordingLimitMinutes: Number(f.recordingLimitMinutes),
          exportQuality: f.exportQuality, purchasable: !!f.purchasable, features: feat,
        }),
      });
      if (r.ok) { setMsg('Saved ✓'); onSaved?.(); } else setMsg('Save failed');
    } catch { setMsg('Network error'); } finally { setBusy(false); setTimeout(() => setMsg(''), 2500); }
  }
  async function reset() {
    setBusy(true);
    try { await fetch(`${API}/api/admin/plans/${plan.slug}/override`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); onSaved?.(); }
    finally { setBusy(false); }
  }

  return (
    <div className={s.planCard}>
      <div className={s.planHead}><strong>{plan.name}</strong><span className={s.slug}>{plan.slug}</span></div>
      <div className={s.fieldGrid}>
        <L label="Monthly $"><input type="number" step="0.01" value={f.monthlyPrice} onChange={(e) => set('monthlyPrice', e.target.value)} /></L>
        <L label="Yearly $"><input type="number" step="0.01" value={f.yearlyPrice} onChange={(e) => set('yearlyPrice', e.target.value)} /></L>
        <L label="Storage (GB)"><input type="number" value={f.storageLimitGB} onChange={(e) => set('storageLimitGB', e.target.value)} /></L>
        <L label="Rec. limit (min)"><input type="number" value={f.recordingLimitMinutes} onChange={(e) => set('recordingLimitMinutes', e.target.value)} /></L>
        <L label="Export quality">
          <select value={f.exportQuality} onChange={(e) => set('exportQuality', e.target.value)}>
            {['480p', '720p', '1080p', '1440p', '4k'].map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </L>
        <L label="Purchasable"><select value={f.purchasable ? '1' : '0'} onChange={(e) => set('purchasable', e.target.value === '1')}><option value="1">Yes</option><option value="0">No</option></select></L>
      </div>
      <div className={s.featToggles}>
        {Object.keys(feat).map((k) => (
          <label key={k} className={s.featToggle}>
            <input type="checkbox" checked={!!feat[k]} onChange={(e) => setFeat((x) => ({ ...x, [k]: e.target.checked }))} />
            {k.replace(/Enabled$/, '').replace(/([A-Z])/g, ' $1').trim()}
          </label>
        ))}
      </div>
      <div className={s.planActions}>
        <button className={`${s.smBtn} ${s.smPrimary}`} disabled={busy} onClick={save}><Save size={13} /> Save</button>
        <button className={s.smBtn} disabled={busy} onClick={reset}><RotateCcw size={13} /> Reset to default</button>
        {msg && <span className={s.saveMsg}>{msg}</span>}
      </div>
    </div>
  );
}
const L = ({ label, children }) => <label className={s.field}><span>{label}</span>{children}</label>;

/* ── Contacts ─────────────────────────────────────────────────────────────── */
function ContactsTab({ token, authGet }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('inbox'); // inbox | new | replied | archived | all
  const load = useCallback(() => authGet('/api/admin/contacts').then((d) => setRows(d.contacts)).catch(() => {}), [authGet]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id, status) {
    await fetch(`${API}/api/admin/contacts/${id}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  if (!rows) return <p className={s.muted}>Loading…</p>;

  const counts = {
    inbox: rows.filter((c) => c.status !== 'archived').length,
    new: rows.filter((c) => c.status === 'new').length,
    replied: rows.filter((c) => c.status === 'replied').length,
    archived: rows.filter((c) => c.status === 'archived').length,
    all: rows.length,
  };
  const TABS_M = [
    { id: 'inbox', label: 'Inbox' }, { id: 'new', label: 'New' },
    { id: 'replied', label: 'Replied' }, { id: 'archived', label: 'Archived' }, { id: 'all', label: 'All' },
  ];
  const shown = rows.filter((c) =>
    filter === 'all' ? true : filter === 'inbox' ? c.status !== 'archived' : c.status === filter);

  return (
    <>
      <h1 className={s.h1}>Messages</h1>
      <div className={s.msgTabs}>
        {TABS_M.map((t) => (
          <button key={t.id} className={filter === t.id ? s.msgTabActive : s.msgTab} onClick={() => setFilter(t.id)}>
            {t.label} <span className={s.msgCount}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {!shown.length && <p className={s.muted}>No messages in “{filter}”.</p>}
      <div className={s.msgList}>
        {shown.map((c) => (
          <div key={c.id} className={`${s.msgCard} ${c.status === 'new' ? s.msgNew : ''}`}>
            <div className={s.msgHead}>
              <div><strong>{c.name}</strong> <a href={`mailto:${c.email}`}>{c.email}</a></div>
              <span className={`${s.badge} ${c.status === 'new' ? s.badgePro : s.badgeFree}`}>{c.status}</span>
            </div>
            {c.subject && <div className={s.msgSubject}>{c.subject}</div>}
            <p className={s.msgBody}>{c.message}</p>
            <div className={s.msgFoot}>
              <span className={s.muted}>{fmtDate(c.createdAt)}</span>
              <div className={s.msgActions}>
                <a className={s.smBtn} href={`mailto:${c.email}?subject=Re: ${encodeURIComponent(c.subject || 'Your message to VeoRec')}`}>Reply</a>
                {c.status !== 'replied' && c.status !== 'archived' && <button className={s.smBtn} onClick={() => setStatus(c.id, 'replied')}>Mark replied</button>}
                {c.status === 'archived'
                  ? <button className={s.smBtn} onClick={() => setStatus(c.id, 'read')}><ArchiveRestore size={13} /> Unarchive</button>
                  : <button className={s.smBtn} onClick={() => setStatus(c.id, 'archived')}>Archive</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── shared bits ──────────────────────────────────────────────────────────── */
const Panel = ({ title, children }) => <div className={s.panel}><h2 className={s.panelTitle}>{title}</h2><div className={s.list}>{children}</div></div>;
const Row = ({ a, b }) => <div className={s.listRow}><span>{a}</span><span className={s.mono}>{b}</span></div>;
