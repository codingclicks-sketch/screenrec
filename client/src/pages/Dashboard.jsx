import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Dashboard.module.css';
import API from '../api';
import { useAuth } from '../AuthContext';

const CLIENT_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : '');

function fmtDur(s) {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
function fmtSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}
function fmtDate(ts) { return new Date(ts).toLocaleString(); }

export default function Dashboard() {
  const { user, logout, authFetch } = useAuth();
  const [recordings, setRecordings] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [copied, setCopied] = useState(null);
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState('all');
  const [settingsRec, setSettingsRec] = useState(null);   // recording being configured
  const [analyticsRec, setAnalyticsRec] = useState(null); // recording showing analytics

  async function load() {
    try {
      const [rRes, fRes] = await Promise.all([
        authFetch(`${API}/api/recordings`),
        authFetch(`${API}/api/folders`),
      ]);
      setRecordings(await rRes.json());
      setFolders(await fRes.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function deleteRec(id) {
    if (!confirm('Delete this recording?')) return;
    await authFetch(`${API}/api/recordings/${id}`, { method: 'DELETE' });
    setRecordings(r => r.filter(x => x.id !== id));
  }
  async function saveTitle(id) {
    await authFetch(`${API}/api/recordings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle }),
    });
    setRecordings(r => r.map(x => x.id === id ? { ...x, title: editTitle } : x));
    setEditingId(null);
  }
  function copyLink(id) {
    navigator.clipboard.writeText(`${CLIENT_BASE}/watch/${id}`);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }
  async function createFolder() {
    const name = prompt('Folder name:');
    if (!name) return;
    const res = await authFetch(`${API}/api/folders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) { const nf = await res.json(); setFolders(f => [...f, nf]); }
  }
  async function deleteFolder(id) {
    if (!confirm('Delete this folder? (recordings are kept)')) return;
    await authFetch(`${API}/api/folders/${id}`, { method: 'DELETE' });
    setFolders(f => f.filter(x => x.id !== id));
    if (activeFolder === id) setActiveFolder('all');
  }

  const filtered = recordings.filter(r => {
    if (activeFolder !== 'all' && r.folder !== activeFolder) return false;
    if (search && !(r.title || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}><span className={styles.dot} />ScreenRec</div>
        <div className={styles.headerRight}>
          <Link to="/account" className={styles.userName}>👤 {user?.name}</Link>
          <Link to="/account" className="btn-ghost" style={{ fontSize: 13 }}>Account</Link>
          <button className="btn-ghost" onClick={logout} style={{ fontSize: 13 }}>Sign out</button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <input className={styles.search} value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search recordings…" />
        <div className={styles.folders}>
          <button className={activeFolder === 'all' ? styles.folderActive : styles.folder}
            onClick={() => setActiveFolder('all')}>All</button>
          {folders.map(f => (
            <span key={f.id} className={styles.folderWrap}>
              <button className={activeFolder === f.id ? styles.folderActive : styles.folder}
                onClick={() => setActiveFolder(f.id)}>📁 {f.name}</button>
              <button className={styles.folderDel} title="Delete folder" onClick={() => deleteFolder(f.id)}>×</button>
            </span>
          ))}
          <button className={styles.folder} onClick={createFolder}>+ New folder</button>
        </div>
      </div>

      <main className={styles.main}>
        {loading && <p className={styles.empty}>Loading…</p>}
        {!loading && recordings.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🎬</div>
            <h2>No recordings yet</h2>
            <p>Use the Chrome extension to record your screen, then your videos will appear here.</p>
          </div>
        )}
        {!loading && recordings.length > 0 && filtered.length === 0 && (
          <p className={styles.empty}>No recordings match your filter.</p>
        )}

        <div className={styles.grid}>
          {filtered.map(r => (
            <div key={r.id} className={styles.card}>
              <Link to={`/watch/${r.id}`} className={styles.thumb}>
                {r.thumbnail
                  ? <img src={r.thumbnail} className={styles.preview} alt={r.title} loading="lazy" />
                  : <div className={styles.preview} style={{ background: '#000' }} />}
                <div className={styles.duration}>{fmtDur(r.duration)}</div>
                {r.privacy && r.privacy !== 'public' && (
                  <div className={styles.lock}>{r.privacy === 'password' ? '🔒' : '👤'}</div>
                )}
              </Link>

              <div className={styles.cardBody}>
                {editingId === r.id ? (
                  <div className={styles.editRow}>
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveTitle(r.id)} autoFocus />
                    <button className="btn-primary" onClick={() => saveTitle(r.id)}>Save</button>
                    <button className="btn-ghost" onClick={() => setEditingId(null)}>×</button>
                  </div>
                ) : (
                  <h3 className={styles.title} onClick={() => { setEditingId(r.id); setEditTitle(r.title); }}
                    title="Click to rename">{r.title}</h3>
                )}

                <p className={styles.meta}>
                  👁 {r.views || 0} · 💬 {r.commentCount || 0} · {fmtDate(r.created_at)}
                </p>

                <div className={styles.actions}>
                  <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}
                    onClick={() => copyLink(r.id)}>
                    {copied === r.id ? '✓ Copied!' : '🔗 Copy Link'}
                  </button>
                  <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setSettingsRec(r)}>⚙ Share</button>
                  <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setAnalyticsRec(r)}>📊 Stats</button>
                  <button className="btn-danger" style={{ fontSize: 12 }} onClick={() => deleteRec(r.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {settingsRec && (
        <ShareSettings rec={settingsRec} folders={folders} authFetch={authFetch}
          onClose={() => setSettingsRec(null)}
          onSaved={(patch) => {
            setRecordings(rs => rs.map(x => x.id === settingsRec.id ? { ...x, ...patch } : x));
            setSettingsRec(null);
          }} />
      )}
      {analyticsRec && (
        <Analytics rec={analyticsRec} authFetch={authFetch} onClose={() => setAnalyticsRec(null)} />
      )}
    </div>
  );
}

// ── Share settings modal ────────────────────────────────────────────────────
function ShareSettings({ rec, folders, authFetch, onClose, onSaved }) {
  const [privacy, setPrivacy] = useState(rec.privacy || 'public');
  const [password, setPassword] = useState('');
  const [description, setDescription] = useState(rec.description || '');
  const [ctaLabel, setCtaLabel] = useState(rec.cta?.label || '');
  const [ctaUrl, setCtaUrl] = useState(rec.cta?.url || '');
  const [folder, setFolder] = useState(rec.folder || '');
  const [saving, setSaving] = useState(false);
  const embed = `<iframe src="${CLIENT_BASE}/embed/${rec.id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  async function save() {
    setSaving(true);
    const body = {
      privacy, description, folder: folder || null,
      cta: ctaUrl ? { label: ctaLabel || 'Learn more', url: ctaUrl } : null,
    };
    if (privacy === 'password' && password) body.password = password;
    const res = await authFetch(`${API}/api/recordings/${rec.id}/meta`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      onSaved({ privacy: d.privacy, description: d.description, cta: d.cta, folder: d.folder });
    }
  }

  return (
    <div className={styles.modalBg} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Share settings</h2>

        <label className={styles.fieldLabel}>Privacy</label>
        <select className={styles.select} value={privacy} onChange={e => setPrivacy(e.target.value)}>
          <option value="public">🌍 Anyone with the link</option>
          <option value="login">👤 Signed-in users only</option>
          <option value="password">🔒 Password protected</option>
        </select>
        {privacy === 'password' && (
          <input className={styles.input} type="password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="Set a password" />
        )}

        <label className={styles.fieldLabel}>Description</label>
        <textarea className={styles.input} rows={2} value={description}
          onChange={e => setDescription(e.target.value)} placeholder="Add a description…" />

        <label className={styles.fieldLabel}>Call-to-action button (optional)</label>
        <input className={styles.input} value={ctaLabel} onChange={e => setCtaLabel(e.target.value)}
          placeholder="Button text (e.g. Book a call)" />
        <input className={styles.input} value={ctaUrl} onChange={e => setCtaUrl(e.target.value)}
          placeholder="https://…" />

        <label className={styles.fieldLabel}>Folder</label>
        <select className={styles.select} value={folder} onChange={e => setFolder(e.target.value)}>
          <option value="">No folder</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>

        <label className={styles.fieldLabel}>Embed code</label>
        <code className={styles.embedCode}>{embed}</code>
        <button className="btn-ghost" style={{ fontSize: 12, marginBottom: 8 }}
          onClick={() => { navigator.clipboard.writeText(embed); setCopiedEmbed(true); setTimeout(() => setCopiedEmbed(false), 2000); }}>
          {copiedEmbed ? '✓ Copied!' : 'Copy embed code'}
        </button>

        <div className={styles.modalActions}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Analytics modal ────────────────────────────────────────────────────────
function Analytics({ rec, authFetch, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    authFetch(`${API}/api/recordings/${rec.id}/analytics`)
      .then(r => r.json()).then(setData).catch(() => setData({}));
  }, [rec.id]);

  return (
    <div className={styles.modalBg} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>📊 {rec.title}</h2>
        {!data ? <p className={styles.empty}>Loading…</p> : (
          <>
            <div className={styles.statRow}>
              <div className={styles.stat}><div className={styles.statNum}>{data.views || 0}</div><div className={styles.statLbl}>Views</div></div>
              <div className={styles.stat}><div className={styles.statNum}>{(data.comments || []).length}</div><div className={styles.statLbl}>Comments</div></div>
              <div className={styles.stat}><div className={styles.statNum}>{Object.values(data.reactions || {}).reduce((a, b) => a + b, 0)}</div><div className={styles.statLbl}>Reactions</div></div>
            </div>

            {data.reactions && Object.keys(data.reactions).length > 0 && (
              <div className={styles.reactSummary}>
                {Object.entries(data.reactions).map(([e, n]) => <span key={e}>{e} {n}</span>)}
              </div>
            )}

            <label className={styles.fieldLabel}>Recent viewers</label>
            {(data.viewers || []).length === 0
              ? <p className={styles.dim}>No signed-in viewers yet.</p>
              : <ul className={styles.viewerList}>
                  {data.viewers.slice(0, 20).map((v, i) => (
                    <li key={i}>{v.name} <span className={styles.dim}>· {new Date(v.at).toLocaleDateString()}</span></li>
                  ))}
                </ul>}

            <label className={styles.fieldLabel}>Comments</label>
            {(data.comments || []).length === 0
              ? <p className={styles.dim}>No comments yet.</p>
              : <ul className={styles.viewerList}>
                  {data.comments.slice().reverse().slice(0, 20).map(c => (
                    <li key={c.id}><strong>{c.name}:</strong> {c.text}</li>
                  ))}
                </ul>}
          </>
        )}
        <div className={styles.modalActions}>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
