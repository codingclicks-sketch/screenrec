import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Dashboard.module.css';
import API from '../api';
import { useAuth } from '../AuthContext';

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function fmtSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString();
}

export default function Dashboard() {
  const { user, logout, authFetch } = useAuth();
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [copied, setCopied] = useState(null);

  async function load() {
    try {
      const res = await authFetch(`${API}/api/recordings`);
      setRecordings(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteRec(id) {
    if (!confirm('Delete this recording?')) return;
    await authFetch(`${API}/api/recordings/${id}`, { method: 'DELETE' });
    setRecordings(r => r.filter(x => x.id !== id));
  }

  async function saveTitle(id) {
    await authFetch(`${API}/api/recordings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle }),
    });
    setRecordings(r => r.map(x => x.id === id ? { ...x, title: editTitle } : x));
    setEditingId(null);
  }

  function copyLink(id) {
    const clientBase = import.meta.env.VITE_API_URL || window.location.origin;
    const url = `${clientBase}/watch/${id}`;
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.dot} />
          ScreenRec
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userName}>👤 {user?.name}</span>
          <button className="btn-ghost" onClick={logout} style={{ fontSize: 13 }}>Sign out</button>
        </div>
      </header>

      <main className={styles.main}>
        {loading && <p className={styles.empty}>Loading…</p>}
        {!loading && recordings.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🎬</div>
            <h2>No recordings yet</h2>
            <p>Use the Chrome extension to record your screen, then your videos will appear here.</p>
          </div>
        )}

        <div className={styles.grid}>
          {recordings.map(r => (
            <div key={r.id} className={styles.card}>
              <Link to={`/watch/${r.id}`} className={styles.thumb}>
                <video
                  src={r.cloudinary ? r.filename : `${API}/uploads/${r.filename}`}
                  muted
                  preload="metadata"
                  className={styles.preview}
                  onLoadedMetadata={(e) => {
                    const v = e.target;
                    if (v.duration === Infinity || isNaN(v.duration)) {
                      v.currentTime = 1e101;
                      v.ontimeupdate = () => { v.ontimeupdate = null; v.currentTime = 0; };
                    }
                  }}
                  onMouseOver={e => e.target.play()}
                  onMouseOut={e => { e.target.pause(); e.target.currentTime = 0; }}
                />
                <div className={styles.duration}>{fmt(r.duration * 1000)}</div>
              </Link>

              <div className={styles.cardBody}>
                {editingId === r.id ? (
                  <div className={styles.editRow}>
                    <input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveTitle(r.id)}
                      autoFocus
                    />
                    <button className="btn-primary" onClick={() => saveTitle(r.id)}>Save</button>
                    <button className="btn-ghost" onClick={() => setEditingId(null)}>×</button>
                  </div>
                ) : (
                  <h3
                    className={styles.title}
                    onClick={() => { setEditingId(r.id); setEditTitle(r.title); }}
                    title="Click to rename"
                  >
                    {r.title}
                  </h3>
                )}

                <p className={styles.meta}>{fmtDate(r.created_at)} · {fmtSize(r.size)}</p>

                <div className={styles.actions}>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '5px 12px' }}
                    onClick={() => copyLink(r.id)}
                  >
                    {copied === r.id ? '✓ Copied!' : '🔗 Copy Link'}
                  </button>
                  <Link to={`/watch/${r.id}`} className="btn-ghost" style={{ fontSize: 12 }}>
                    Watch
                  </Link>
                  <button className="btn-danger" style={{ fontSize: 12 }} onClick={() => deleteRec(r.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
