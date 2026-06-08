import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MoreHorizontal, Copy, Share2, BarChart2, Pencil, Trash2, Check,
  LayoutGrid, List, Lock, Users as UsersIcon, Play, Film, FolderInput, Scissors,
} from 'lucide-react';
import styles from './Dashboard.module.css';
import API from '../api';
import { useAuth } from '../AuthContext';
import AppShell from '../components/AppShell';
import UpgradeModal from '../components/UpgradeModal';

const CLIENT_BASE = typeof window !== 'undefined' ? window.location.origin : '';

function fmtDur(s) { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) { const h = Math.floor(d / 3600); return `${h} hour${h > 1 ? 's' : ''} ago`; }
  const days = Math.floor(d / 86400);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Dashboard() {
  const { user, authFetch } = useAuth();
  const [recordings, setRecordings] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [copied, setCopied] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState('grid');
  const [settingsRec, setSettingsRec] = useState(null);
  const [analyticsRec, setAnalyticsRec] = useState(null);
  const [upgrade, setUpgrade] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  async function load() {
    try {
      const [rRes, fRes] = await Promise.all([authFetch(`${API}/api/recordings`), authFetch(`${API}/api/folders`)]);
      setRecordings(await rRes.json());
      setFolders(await fRes.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function deleteRec(id) {
    setConfirmState({
      title: 'Delete recording?', message: 'This permanently removes the video and its link. This cannot be undone.',
      danger: true, confirmLabel: 'Delete',
      onConfirm: async () => { await authFetch(`${API}/api/recordings/${id}`, { method: 'DELETE' }); setRecordings((r) => r.filter((x) => x.id !== id)); },
    });
  }
  async function saveTitle(id) {
    const title = (editTitle || '').trim();
    if (!title) { setEditingId(null); return; }  // don't save empty titles
    const res = await authFetch(`${API}/api/recordings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      setRecordings((r) => r.map((x) => (x.id === id ? { ...x, title: d.title || title } : x)));
      setEditingId(null);
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || 'Could not rename the video. Please try again.');
    }
  }
  function copyLink(id) { navigator.clipboard.writeText(`${CLIENT_BASE}/watch/${id}`); setCopied(id); setTimeout(() => setCopied(null), 2000); }
  async function moveToFolder(id, folderId) {
    await authFetch(`${API}/api/recordings/${id}/meta`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: folderId }) });
    setRecordings((r) => r.map((x) => (x.id === id ? { ...x, folder: folderId } : x)));
  }

  const filtered = recordings
    .filter((r) => !search || (r.title || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (sort === 'oldest' ? a.created_at - b.created_at : sort === 'views' ? (b.views || 0) - (a.views || 0) : b.created_at - a.created_at));

  return (
    <AppShell active="library" search={search} onSearch={setSearch}>
      <div className={styles.pageHead}>
        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>Library</h1>
          <span className={styles.count}>{recordings.length} videos</span>
        </div>
        <div className={styles.toolbar}>
          <select className={styles.sort} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="views">Most viewed</option>
          </select>
          <div className={styles.viewToggle}>
            <button className={view === 'grid' ? styles.viewActive : styles.viewBtn} onClick={() => setView('grid')}><LayoutGrid size={16} /></button>
            <button className={view === 'list' ? styles.viewActive : styles.viewBtn} onClick={() => setView('list')}><List size={16} /></button>
          </div>
        </div>
      </div>

      {loading && (
        <div className={styles.grid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.card}><div className={`${styles.thumb} ${styles.skel}`} /><div className={styles.cardBody}><div className={styles.skelLine} style={{ width: '70%' }} /><div className={styles.skelLine} style={{ width: '45%', height: 10 }} /></div></div>
          ))}
        </div>
      )}

      {!loading && recordings.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Film size={30} color="#5b5bf6" /></div>
          <h2>No recordings yet</h2>
          <p>Click <strong>Record Video</strong> and the VeoRec extension captures your screen. Your videos show up here.</p>
        </div>
      )}
      {!loading && recordings.length > 0 && filtered.length === 0 && <p className={styles.noMatch}>No recordings match “{search}”.</p>}

      <div className={view === 'grid' ? styles.grid : styles.list}>
        {filtered.map((r) => (
          <Card
            key={r.id} r={r} view={view} folders={folders}
            copied={copied === r.id} editing={editingId === r.id} editTitle={editTitle}
            onCopy={() => copyLink(r.id)}
            onShare={() => setSettingsRec(r)}
            onStats={() => setAnalyticsRec(r)}
            onRename={() => { setEditingId(r.id); setEditTitle(r.title); }}
            onRenameChange={setEditTitle}
            onRenameSave={() => saveTitle(r.id)}
            onRenameCancel={() => setEditingId(null)}
            onMove={(fid) => moveToFolder(r.id, fid)}
            onDelete={() => deleteRec(r.id)}
          />
        ))}
      </div>

      {confirmState && <Confirm state={confirmState} onClose={() => setConfirmState(null)} />}
      {settingsRec && (
        <ShareSettings rec={settingsRec} folders={folders} authFetch={authFetch}
          onClose={() => setSettingsRec(null)}
          onUpgrade={(feature, reason) => { setSettingsRec(null); setUpgrade({ feature, reason }); }}
          onSaved={(patch) => { setRecordings((rs) => rs.map((x) => (x.id === settingsRec.id ? { ...x, ...patch } : x))); setSettingsRec(null); }} />
      )}
      {analyticsRec && (
        <Analytics rec={analyticsRec} authFetch={authFetch}
          onUpgrade={(feature, reason) => { setAnalyticsRec(null); setUpgrade({ feature, reason }); }}
          onClose={() => setAnalyticsRec(null)} />
      )}
      <UpgradeModal open={!!upgrade} feature={upgrade?.feature || 'default'} reason={upgrade?.reason} onClose={() => setUpgrade(null)} />
    </AppShell>
  );
}

/* ── Video card (grid + list) ─────────────────────────────────────────────── */
function Card({ r, view, folders, copied, editing, editTitle, onCopy, onShare, onStats, onRename, onRenameChange, onRenameSave, onRenameCancel, onMove, onDelete }) {
  const [menu, setMenu] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) { setMenu(false); setMoveOpen(false); } }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const menuEl = (
    <div className={styles.cardMenuWrap} ref={ref}>
      <button className={styles.menuBtn} onClick={() => setMenu((m) => !m)}><MoreHorizontal size={18} /></button>
      {menu && (
        <div className={styles.menu}>
          <button className={styles.menuItem} onClick={() => { setMenu(false); onCopy(); }}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied!' : 'Copy link'}</button>
          <button className={styles.menuItem} onClick={() => { setMenu(false); onShare(); }}><Share2 size={15} /> Share settings</button>
          <button className={styles.menuItem} onClick={() => { setMenu(false); onStats(); }}><BarChart2 size={15} /> Analytics</button>
          <Link className={styles.menuItem} to={`/edit/${r.id}`}><Scissors size={15} /> Edit / trim</Link>
          <button className={styles.menuItem} onClick={() => { setMenu(false); onRename(); }}><Pencil size={15} /> Rename</button>
          <div className={styles.menuSub}>
            <button className={styles.menuItem} onClick={() => setMoveOpen((o) => !o)}><FolderInput size={15} /> Move to folder</button>
            {moveOpen && (
              <div className={styles.subMenu}>
                <button className={styles.menuItem} onClick={() => { setMenu(false); onMove(null); }}>No folder</button>
                {folders.map((f) => <button key={f.id} className={styles.menuItem} onClick={() => { setMenu(false); onMove(f.id); }}>{f.name}</button>)}
                {!folders.length && <span className={styles.menuEmpty}>No folders yet</span>}
              </div>
            )}
          </div>
          <div className={styles.menuDivider} />
          <button className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => { setMenu(false); onDelete(); }}><Trash2 size={15} /> Delete</button>
        </div>
      )}
    </div>
  );

  const titleEl = editing ? (
    <div className={styles.editRow}>
      <input value={editTitle} onChange={(e) => onRenameChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onRenameSave()} autoFocus />
      <button className={styles.miniPrimary} onClick={onRenameSave}>Save</button>
      <button className={styles.miniGhost} onClick={onRenameCancel}>×</button>
    </div>
  ) : (
    <h3 className={styles.title} onClick={onRename} title="Click to rename">{r.title}</h3>
  );

  if (view === 'list') {
    return (
      <div className={styles.listRow}>
        <Thumb r={r} small />
        <div className={styles.listMain}>{titleEl}<p className={styles.meta}><UsersIcon size={13} /> {r.views || 0} views · {timeAgo(r.created_at)}</p></div>
        {menuEl}
      </div>
    );
  }
  return (
    <div className={styles.card}>
      <Thumb r={r} />
      <div className={styles.cardBody}>
        {titleEl}
        <div className={styles.cardFoot}>
          <p className={styles.meta}><UsersIcon size={13} /> {r.views || 0} views · {timeAgo(r.created_at)}</p>
          {menuEl}
        </div>
      </div>
    </div>
  );
}

function Thumb({ r, small }) {
  const [hover, setHover] = useState(false);
  const src = r.cloudinary ? r.filename : `${API}/uploads/${r.filename}`;
  return (
    <Link to={`/watch/${r.id}`} className={small ? styles.thumbSmall : styles.thumb} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {r.thumbnail ? <img src={r.thumbnail} className={styles.preview} alt={r.title} loading="lazy" /> : <div className={styles.preview} style={{ background: '#1a1a2e' }} />}
      {hover && !small && (
        <video className={styles.previewVid} src={src} muted autoPlay loop playsInline
          onLoadedMetadata={(e) => { const v = e.target; if (v.duration === Infinity || isNaN(v.duration)) { v.currentTime = 1e101; v.ontimeupdate = () => { v.ontimeupdate = null; v.currentTime = 0; v.play(); }; } }} />
      )}
      <div className={styles.duration}>{fmtDur(r.duration)}</div>
      {r.privacy && r.privacy !== 'public' && <div className={styles.lock}>{r.privacy === 'password' ? <Lock size={12} /> : <UsersIcon size={12} />}</div>}
      {!hover && !small && <span className={styles.playOverlay}><Play size={20} fill="#fff" /></span>}
    </Link>
  );
}

function Confirm({ state, onClose }) {
  return (
    <div className={styles.modalBg} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h2 className={styles.modalTitle}>{state.title}</h2>
        <p className={styles.modalText}>{state.message}</p>
        <div className={styles.modalActions}>
          <button className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button className={state.danger ? styles.dangerBtn : styles.primaryBtn} onClick={async () => { const fn = state.onConfirm; onClose(); if (fn) await fn(); }}>{state.confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Share settings modal (unchanged behaviour) ───────────────────────────── */
function ShareSettings({ rec, folders, authFetch, onClose, onSaved, onUpgrade }) {
  const [title, setTitle] = useState(rec.title || '');
  const [privacy, setPrivacy] = useState(rec.privacy || 'public');
  const [password, setPassword] = useState('');
  const [description, setDescription] = useState(rec.description || '');
  const [ctaLabel, setCtaLabel] = useState(rec.cta?.label || '');
  const [ctaUrl, setCtaUrl] = useState(rec.cta?.url || '');
  const [folder, setFolder] = useState(rec.folder || '');
  const [trimStart, setTrimStart] = useState(rec.trimStart ?? '');
  const [trimEnd, setTrimEnd] = useState(rec.trimEnd ?? '');
  const [saving, setSaving] = useState(false);
  const embed = `<iframe src="${CLIENT_BASE}/embed/${rec.id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  async function save() {
    setSaving(true);
    const body = {
      title: title.trim() || undefined, privacy, description, folder: folder || null,
      cta: ctaUrl ? { label: ctaLabel || 'Learn more', url: ctaUrl } : null,
      trimStart: trimStart === '' ? null : Number(trimStart), trimEnd: trimEnd === '' ? null : Number(trimEnd),
    };
    if (privacy === 'password' && password) body.password = password;
    const res = await authFetch(`${API}/api/recordings/${rec.id}/meta`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      onSaved({ title: title.trim() || rec.title, privacy: d.privacy, description: d.description, cta: d.cta, folder: d.folder, trimStart: d.trimStart, trimEnd: d.trimEnd });
    } else if (res.status === 403) {
      const d = await res.json().catch(() => ({}));
      if (d.upgradeRequired && onUpgrade) onUpgrade(d.feature || 'default', d.error);
    }
  }

  return (
    <div className={styles.modalBg} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Video settings</h2>
        <label className={styles.fieldLabel}>Title</label>
        <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Video title" />
        <label className={styles.fieldLabel}>Trim (seconds) — viewers only see this range</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className={styles.input} type="number" min="0" value={trimStart} onChange={(e) => setTrimStart(e.target.value)} placeholder="Start (e.g. 3)" />
          <input className={styles.input} type="number" min="0" value={trimEnd} onChange={(e) => setTrimEnd(e.target.value)} placeholder={`End (e.g. ${rec.duration || 60})`} />
        </div>
        <label className={styles.fieldLabel}>Privacy</label>
        <select className={styles.select} value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
          <option value="public">Anyone with the link</option>
          <option value="login">Signed-in users only</option>
          <option value="password">Password protected</option>
        </select>
        {privacy === 'password' && <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a password" />}
        <label className={styles.fieldLabel}>Description</label>
        <textarea className={styles.input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a description…" />
        <label className={styles.fieldLabel}>Call-to-action button (optional)</label>
        <input className={styles.input} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Button text (e.g. Book a call)" />
        <input className={styles.input} value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" />
        <label className={styles.fieldLabel}>Folder</label>
        <select className={styles.select} value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="">No folder</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <label className={styles.fieldLabel}>Embed code</label>
        <code className={styles.embedCode}>{embed}</code>
        <button className={styles.ghostBtn} style={{ fontSize: 12, marginBottom: 8 }} onClick={() => { navigator.clipboard.writeText(embed); setCopiedEmbed(true); setTimeout(() => setCopiedEmbed(false), 2000); }}>{copiedEmbed ? '✓ Copied!' : 'Copy embed code'}</button>
        <div className={styles.modalActions}>
          <button className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button className={styles.primaryBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function Analytics({ rec, authFetch, onClose, onUpgrade }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    authFetch(`${API}/api/recordings/${rec.id}/analytics`)
      .then(async (r) => { if (r.status === 403) { const d = await r.json().catch(() => ({})); if (d.upgradeRequired && onUpgrade) onUpgrade(d.feature || 'analytics', d.error); return null; } return r.json(); })
      .then((d) => { if (d) setData(d); }).catch(() => setData({}));
  }, [rec.id]);
  return (
    <div className={styles.modalBg} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{rec.title}</h2>
        {!data ? <p className={styles.noMatch}>Loading…</p> : (
          <>
            <div className={styles.statRow}>
              <div className={styles.stat}><div className={styles.statNum}>{data.views || 0}</div><div className={styles.statLbl}>Views</div></div>
              <div className={styles.stat}><div className={styles.statNum}>{(data.comments || []).length}</div><div className={styles.statLbl}>Comments</div></div>
              <div className={styles.stat}><div className={styles.statNum}>{(data.reactions || []).length}</div><div className={styles.statLbl}>Reactions</div></div>
            </div>
            <label className={styles.fieldLabel}>Recent viewers</label>
            {(data.viewers || []).length === 0 ? <p className={styles.dim}>No signed-in viewers yet.</p> : (
              <ul className={styles.viewerList}>{data.viewers.slice(0, 20).map((v, i) => <li key={i}>{v.name} <span className={styles.dim}>· {new Date(v.at).toLocaleDateString()}</span></li>)}</ul>
            )}
            <label className={styles.fieldLabel}>Comments</label>
            {(data.comments || []).length === 0 ? <p className={styles.dim}>No comments yet.</p> : (
              <ul className={styles.viewerList}>{data.comments.slice().reverse().slice(0, 20).map((c) => <li key={c.id}><strong>{c.name}:</strong> {c.text}</li>)}</ul>
            )}
          </>
        )}
        <div className={styles.modalActions}><button className={styles.primaryBtn} onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
