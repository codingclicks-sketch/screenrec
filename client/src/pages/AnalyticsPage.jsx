import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Video, MessageSquare, TrendingUp } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useBilling } from '../hooks/useBilling';
import API from '../api';
import AppShell from '../components/AppShell';
import s from './AnalyticsPage.module.css';

export default function AnalyticsPage() {
  const { authFetch } = useAuth();
  const { can } = useBilling();
  const [recs, setRecs] = useState(null);

  useEffect(() => {
    authFetch(`${API}/api/recordings`).then((r) => r.json()).then(setRecs).catch(() => setRecs([]));
  }, []);

  if (recs === null) return <AppShell active="analytics"><p className={s.muted}>Loading…</p></AppShell>;

  const totalViews = recs.reduce((a, r) => a + (r.views || 0), 0);
  const totalComments = recs.reduce((a, r) => a + (r.commentCount || 0), 0);
  const top = [...recs].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10);

  const stats = [
    { label: 'Total views', value: totalViews, Icon: Eye, color: '#5b5bf6' },
    { label: 'Videos', value: recs.length, Icon: Video, color: '#16a34a' },
    { label: 'Comments', value: totalComments, Icon: MessageSquare, color: '#f59e0b' },
    { label: 'Avg. views / video', value: recs.length ? Math.round(totalViews / recs.length) : 0, Icon: TrendingUp, color: '#ec4899' },
  ];

  return (
    <AppShell active="analytics">
      <h1 className={s.title}>Analytics</h1>

      {!can('analyticsEnabled') && (
        <div className={s.proBanner}>
          <strong>Per-viewer analytics is a Pro feature.</strong> You can see totals here — upgrade to see exactly who watched, watch-through, and reactions on each video.
          <Link to="/pricing" className={s.proBtn}>Upgrade to Pro</Link>
        </div>
      )}

      <div className={s.statGrid}>
        {stats.map((st, i) => (
          <div key={i} className={s.statCard}>
            <div className={s.statIcon} style={{ background: `${st.color}1a` }}><st.Icon size={20} color={st.color} /></div>
            <div><div className={s.statValue}>{st.value.toLocaleString()}</div><div className={s.statLabel}>{st.label}</div></div>
          </div>
        ))}
      </div>

      <div className={s.panel}>
        <h2 className={s.panelTitle}>Top videos by views</h2>
        {!top.length ? <p className={s.muted}>No recordings yet.</p> : (
          <div className={s.list}>
            {top.map((r) => (
              <Link key={r.id} to={`/watch/${r.id}`} className={s.row}>
                <div className={s.rowThumb}>{r.thumbnail ? <img src={r.thumbnail} alt="" /> : <div className={s.blank} />}</div>
                <div className={s.rowMain}><strong>{r.title}</strong><small>{r.commentCount || 0} comments</small></div>
                <div className={s.rowViews}><Eye size={14} /> {r.views || 0}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
