import React, { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users as UsersIcon, CreditCard, Mail, DollarSign,
  TrendingUp, HardDrive, Video, UserCheck, RefreshCw, Crown, Ban, Save, RotateCcw,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import API from '../api';
import s from './Admin.module.css';

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

const TABS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
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

/* ── Users ────────────────────────────────────────────────────────────────── */
function UsersTab({ token, authGet }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');

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

  return (
    <>
      <div className={s.headRow}>
        <h1 className={s.h1}>Users {rows ? `(${rows.length})` : ''}</h1>
        <input className={s.search} placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!rows ? <p className={s.muted}>Loading…</p> : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>User</th><th>Plan</th><th>Storage</th><th>Videos</th><th>Joined</th><th>Grant premium</th></tr></thead>
            <tbody>
              {rows.map((u) => <UserRow key={u.id} u={u} busy={busy === u.id} onSet={setPlan} />)}
              {!rows.length && <tr><td colSpan={6} className={s.muted}>No users found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function UserRow({ u, busy, onSet }) {
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
      <td>{planBadge}<div className={s.subMeta}>{u.subscriptionStatus ? `sub: ${u.subscriptionStatus}` : u.source}</div></td>
      <td>{gb(u.storageUsedBytes)}</td>
      <td>{u.videoCount}</td>
      <td className={s.nowrap}>{fmtDate(u.createdAt)}</td>
      <td>
        <div className={s.grantRow}>
          {u.comped ? (
            <button className={`${s.smBtn} ${s.smDanger}`} disabled={busy} onClick={() => onSet(u.id, 'free')}><Ban size={13} /> Revoke</button>
          ) : (
            <>
              <input className={s.daysInput} placeholder="∞ days" value={days} onChange={(e) => setDays(e.target.value)} title="Optional: days until it expires (blank = forever)" />
              <button className={`${s.smBtn} ${s.smPrimary}`} disabled={busy} onClick={() => onSet(u.id, 'pro', days)}><Crown size={13} /> Grant Pro</button>
            </>
          )}
        </div>
      </td>
    </tr>
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
        <L label="Export quality"><input value={f.exportQuality} onChange={(e) => set('exportQuality', e.target.value)} /></L>
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
  return (
    <>
      <h1 className={s.h1}>Messages {rows.length ? `(${rows.length})` : ''}</h1>
      {!rows.length && <p className={s.muted}>No messages yet. They’ll appear here when someone uses the contact form.</p>}
      <div className={s.msgList}>
        {rows.map((c) => (
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
                {c.status !== 'replied' && <button className={s.smBtn} onClick={() => setStatus(c.id, 'replied')}>Mark replied</button>}
                {c.status !== 'archived' && <button className={s.smBtn} onClick={() => setStatus(c.id, 'archived')}>Archive</button>}
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
