import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import API from '../api';
import s from './Admin.module.css';

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Stat({ label, value, accent }) {
  return (
    <div className={s.stat}>
      <div className={s.statValue} style={accent ? { color: accent } : undefined}>{value}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

export default function Admin() {
  const { user, token, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/admin/metrics`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || 'Forbidden'); return r.json(); })
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [token]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user && user.isAdmin === false && err === 'Admin only') return <div className={s.page}><div className={s.main}><p>Not authorized.</p><Link to="/">← Back</Link></div></div>;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <Link to="/" className={s.logo}><span className={s.dot} />VeoRec <span className={s.adminTag}>Admin</span></Link>
        <Link to="/" className={s.back}>← Dashboard</Link>
      </header>
      <main className={s.main}>
        <h1 className={s.title}>Business metrics</h1>
        {err && <div className={s.err}>{err}</div>}
        {!data && !err && <p className={s.muted}>Loading metrics…</p>}

        {data && (
          <>
            <section className={s.gridStats}>
              <Stat label="MRR" value={money(data.mrr)} accent="#16a34a" />
              <Stat label="Annual revenue" value={money(data.annualRevenue)} accent="#16a34a" />
              <Stat label="Total users" value={data.totalUsers} />
              <Stat label="Paid users" value={data.paidUsers} accent="#5b5bf6" />
              <Stat label="Free users" value={data.freeUsers} />
              <Stat label="Active (30d)" value={data.activeUsers} />
              <Stat label="Upgrade rate" value={`${data.upgradeRate}%`} accent="#5b5bf6" />
              <Stat label="Churn rate" value={`${data.churnRate}%`} accent={data.churnRate > 5 ? '#dc2626' : undefined} />
              <Stat label="Videos uploaded" value={data.videosUploaded} />
              <Stat label="Storage used" value={`${data.storageConsumedGB} GB`} />
            </section>

            <section className={s.cols}>
              <div className={s.panel}>
                <h2 className={s.panelTitle}>Top storage users</h2>
                <ul className={s.list}>
                  {data.topStorageUsers.map((u) => (
                    <li key={u.id}><span>{u.email}</span><span className={s.mono}>{(u.bytes / 1024 ** 3).toFixed(2)} GB</span></li>
                  ))}
                  {!data.topStorageUsers.length && <li className={s.muted}>No data yet</li>}
                </ul>
              </div>
              <div className={s.panel}>
                <h2 className={s.panelTitle}>Most active users</h2>
                <ul className={s.list}>
                  {data.mostActiveUsers.map((u) => (
                    <li key={u.id}><span>{u.email}</span><span className={s.mono}>{u.videos} videos</span></li>
                  ))}
                  {!data.mostActiveUsers.length && <li className={s.muted}>No data yet</li>}
                </ul>
              </div>
            </section>

            <section className={s.panel}>
              <h2 className={s.panelTitle}>Upgrade triggers (last 30 days) · {data.conversionEvents.total} events</h2>
              <ul className={s.list}>
                {Object.entries(data.conversionEvents.byFeature)
                  .sort((a, b) => b[1] - a[1])
                  .map(([feature, count]) => (
                    <li key={feature}><span>{feature.replace(/_/g, ' ')}</span><span className={s.mono}>{count}</span></li>
                  ))}
                {!data.conversionEvents.total && <li className={s.muted}>No paywall events recorded yet</li>}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
