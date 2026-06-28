import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Scissors, Sparkles, Link2, Download, Settings as SettingsIcon,
  Activity as ActivityIcon, Pencil, Code2, Crown, Share2, Check,
  FileText, Search, Loader2, RefreshCw, MoreHorizontal, Eye, X, MessageSquare,
  User as UserIcon, HelpCircle, BarChart3, LogOut, PlaySquare,
  FolderInput, CopyPlus, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import styles from './Watch.module.css';
import API from '../api';
import { useAuth } from '../AuthContext';
import { useBilling } from '../hooks/useBilling';
import VideoPlayer from '../components/VideoPlayer';

const REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '👏'];

function fmt(s) {
  s = Math.round(s || 0);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
function clock(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function timeAgo(ts) {
  if (!ts) return '';
  const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [name, s] of units) {
    const n = Math.floor(sec / s);
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}
function authHeaders() {
  const t = localStorage.getItem('sr_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function Watch() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const { isPaid } = useBilling();   // reflect the viewer's real plan in the UI
  const navigate = useNavigate();
  const videoRef = useRef(null);

  const [rec, setRec] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | notfound | login | password
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [copied, setCopied] = useState('');
  const [videoReady, setVideoReady] = useState(false); // player can actually play
  const [menuOpen, setMenuOpen] = useState(false);   // header "more" (⋯) menu
  const [avatarOpen, setAvatarOpen] = useState(false); // account dropdown
  const [viewsOpen, setViewsOpen] = useState(false);   // views/insights popup
  const [viewers, setViewers] = useState(null);        // analytics viewers list
  const [settingsSub, setSettingsSub] = useState('audience'); // Settings: 'audience' | 'enhancements'
  const [summaryDraft, setSummaryDraft] = useState(null);     // editable Summary (owner)
  const [tagInput, setTagInput] = useState('');

  const [views, setViews] = useState(0);
  const [reactions, setReactions] = useState([]);   // [{emoji, t, at}]
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentName, setCommentName] = useState('');
  const [atTime, setAtTime] = useState(true);
  const [dur, setDur] = useState(0);                // real video duration (s)
  const [isOwner, setIsOwner] = useState(false);    // show owner-only panels
  const [canTranscribe, setCanTranscribe] = useState(true); // plan allows transcription
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const [autoTitling, setAutoTitling] = useState(false);
  const [commentDockOpen, setCommentDockOpen] = useState(false);
  const [folders, setFolders] = useState([]);          // owner's folders (⋯ → Move)
  const [moveOpen, setMoveOpen] = useState(false);     // ⋯ → Move submenu

  // Sidebar tabs (Loom-style). Owners default to "Make edits"; viewers see Activity.
  const [tab, setTab] = useState('activity');
  const [tabTouched, setTabTouched] = useState(false);
  // Inline "Add link" (CTA) editor
  const [ctaOpen, setCtaOpen] = useState(false);
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  // Transcript
  const [transcript, setTranscript] = useState(null); // { status, configured, segments, text, language }
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptErr, setTranscriptErr] = useState('');
  const [tQuery, setTQuery] = useState('');
  const [videoTime, setVideoTime] = useState(0);
  const activeSegRef = useRef(null);

  // Determine ownership (owner-only endpoint 200s only for the owner).
  useEffect(() => {
    if (!user) { setIsOwner(false); return; }
    fetch(`${API}/api/recordings/${id}`, { headers: authHeaders() })
      .then(async r => {
        setIsOwner(r.ok);
        if (r.ok) { const d = await r.json().catch(() => ({})); setCanTranscribe(d.canTranscribe !== false); }
      })
      .catch(() => setIsOwner(false));
  }, [user, id]);

  useEffect(() => { if (isOwner && !tabTouched) setTab('edit'); }, [isOwner, tabTouched]);

  // Owner's folders for the ⋯ → "Move to folder" submenu.
  useEffect(() => {
    if (!isOwner) return;
    fetch(`${API}/api/folders`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(d => setFolders(Array.isArray(d) ? d : [])).catch(() => {});
  }, [isOwner]);

  function selectTab(t) { setTabTouched(true); setTab(t); }

  async function saveRename() {
    const title = (renameVal || '').trim();
    if (!title) { setRenaming(false); return; }
    const res = await fetch(`${API}/api/recordings/${id}`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    if (res.ok) { const d = await res.json().catch(() => ({})); setRec((r) => ({ ...r, title: d.title || title })); setRenaming(false); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Could not rename'); }
  }

  async function deleteVideo() {
    if (!window.confirm('Delete this video permanently? This can’t be undone.')) return;
    const res = await fetch(`${API}/api/recordings/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) navigate('/'); else alert('Could not delete this video.');
  }
  async function duplicateVideo() {
    setMenuOpen(false);
    const res = await fetch(`${API}/api/recordings/${id}/duplicate`, { method: 'POST', headers: authHeaders() });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.id) navigate(`/watch/${d.id}`); else alert(d.error || 'Could not duplicate this video.');
  }
  function openCommentDock() {
    try { videoRef.current?.pause(); } catch {}
    setCommentDockOpen(true);
  }
  async function postDockComment() {
    if (!commentText.trim()) return;
    const t = Math.floor(videoTime);
    const res = await fetch(`${API}/api/watch/${id}/comment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text: commentText, name: commentName, t }),
    });
    const c = await res.json().catch(() => ({}));
    if (res.ok && c.id) { setComments(cs => [...cs, c]); setCommentText(''); setCommentDockOpen(false); }
    else alert(c.error || 'Could not post comment.');
  }
  function loadViewers() {
    fetch(`${API}/api/recordings/${id}/analytics`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setViewers(Array.isArray(d?.viewers) ? d.viewers : []))
      .catch(() => setViewers([]));
  }

  async function autoTitle() {
    setAutoTitling(true);
    try {
      const res = await fetch(`${API}/api/recordings/${id}/title/auto`, { method: 'POST', headers: authHeaders() });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.title) { setRec(r => ({ ...r, title: d.title })); if (d.transcriptGenerated) setTranscript(null); }
      else if (d.code === 'feature_locked') { setCanTranscribe(false); selectTab('transcript'); }
      else alert(d.error || 'Could not generate a title.');
    } catch { alert('Network error — please try again.'); }
    finally { setAutoTitling(false); }
  }

  async function saveCta() {
    let url = (ctaUrl || '').trim();
    if (!url) { setCtaOpen(false); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const res = await fetch(`${API}/api/recordings/${id}/meta`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cta: { label: (ctaLabel || '').trim() || 'Learn more', url } }),
    });
    if (res.ok) { const d = await res.json().catch(() => ({})); setRec((r) => ({ ...r, cta: d.cta })); setCtaOpen(false); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Could not save link'); }
  }
  // ── Owner: audience / sharing settings (optimistic) ─────────────────────────
  function patchMeta(body) {
    return fetch(`${API}/api/recordings/${id}/meta`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  }
  function saveAudience(partial) {
    setRec(r => ({ ...r, audience: { ...(r.audience || {}), ...partial } }));
    patchMeta({ audience: partial }).catch(() => {});
  }
  function savePrivacy(privacy) {
    setRec(r => ({ ...r, privacy }));
    patchMeta({ privacy }).catch(() => {});
  }
  function saveSpeed(v) {
    setRec(r => ({ ...r, recommendedSpeed: v }));
    if (videoRef.current) try { videoRef.current.playbackRate = v || 1; } catch {}
    patchMeta({ recommendedSpeed: v }).catch(() => {});
  }
  function saveThumb(on) {
    setRec(r => ({ ...r, animatedThumbnail: on }));
    patchMeta({ animatedThumbnail: on }).catch(() => {});
  }
  function saveArchived(on) {
    setRec(r => ({ ...r, archived: on }));
    patchMeta({ archived: on }).catch(() => {});
  }
  function moveToFolder(folderId) {
    setMoveOpen(false); setMenuOpen(false);
    setRec(r => ({ ...r, folder: folderId }));
    patchMeta({ folder: folderId }).catch(() => {});
  }
  function saveSummary(text) {
    const t = (text || '').trim();
    if (t === (rec.description || '')) return;
    setRec(r => ({ ...r, description: t }));
    patchMeta({ description: t }).catch(() => {});
  }
  function addTag(raw) {
    const t = String(raw || '').trim().replace(/^#/, '').slice(0, 40);
    if (!t) return;
    const next = [...new Set([...(rec.tags || []), t])].slice(0, 20);
    setRec(r => ({ ...r, tags: next })); setTagInput('');
    patchMeta({ tags: next }).catch(() => {});
  }
  function removeTag(t) {
    const next = (rec.tags || []).filter(x => x !== t);
    setRec(r => ({ ...r, tags: next }));
    patchMeta({ tags: next }).catch(() => {});
  }

  async function removeCta() {
    const res = await fetch(`${API}/api/recordings/${id}/meta`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ cta: null }),
    });
    if (res.ok) { setRec((r) => ({ ...r, cta: null })); setCtaLabel(''); setCtaUrl(''); }
  }

  // ── Transcript ──────────────────────────────────────────────────────────────
  function loadTranscript() {
    fetch(`${API}/api/watch/${id}/transcript`, { headers: authHeaders() })
      .then(r => r.json()).then(setTranscript).catch(() => {});
  }
  // Lazy-load the transcript the first time the tab is opened.
  useEffect(() => { if (tab === 'transcript' && !transcript) loadTranscript(); /* eslint-disable-next-line */ }, [tab]);

  async function generateTranscript() {
    setTranscribing(true); setTranscriptErr('');
    try {
      const res = await fetch(`${API}/api/recordings/${id}/transcribe`, { method: 'POST', headers: authHeaders() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.code === 'feature_locked') { setCanTranscribe(false); return; }
        setTranscriptErr(d.error || 'Transcription failed');
        setTranscript(t => ({ ...(t || {}), configured: d.code === 'transcription_unconfigured' ? false : (t?.configured ?? true) }));
        return;
      }
      setTranscript({ status: 'done', configured: true, segments: d.segments || [], text: d.text || '', language: d.language });
    } catch (e) {
      setTranscriptErr('Network error — please try again.');
    } finally { setTranscribing(false); }
  }

  const segs = transcript?.segments || [];
  const filteredSegs = useMemo(() => {
    const q = tQuery.trim().toLowerCase();
    if (!q) return segs.map((s, i) => ({ ...s, i }));
    return segs.map((s, i) => ({ ...s, i })).filter(s => s.text.toLowerCase().includes(q));
  }, [segs, tQuery]);
  const activeSegIdx = useMemo(() => {
    if (!segs.length) return -1;
    return segs.findIndex(s => videoTime >= s.start && videoTime < s.end);
  }, [segs, videoTime]);
  // Auto-scroll the active line into view while playing.
  useEffect(() => {
    if (tab === 'transcript' && activeSegRef.current) {
      activeSegRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeSegIdx, tab]);

  // reactions can be an array [{emoji,t,at}] (current) or a legacy tally object
  // {emoji: count}. Normalise so the rest of the component is bulletproof.
  const reactionsArr = Array.isArray(reactions) ? reactions : [];
  const reactionCounts = useMemo(() => {
    if (Array.isArray(reactions)) {
      const c = {};
      reactions.forEach(r => { c[r.emoji] = (c[r.emoji] || 0) + 1; });
      return c;
    }
    return reactions && typeof reactions === 'object' ? reactions : {};
  }, [reactions]);

  // markers on the timeline: comments + reactions that have a timestamp
  const markers = useMemo(() => {
    const m = [];
    (Array.isArray(comments) ? comments : []).forEach(c => { if (c.t != null) m.push({ kind: 'comment', t: c.t, label: c.name + ': ' + c.text }); });
    reactionsArr.forEach(r => { if (r.t != null) m.push({ kind: 'react', t: r.t, label: r.name ? `${r.name} reacted ${r.emoji}` : r.emoji, emoji: r.emoji }); });
    return m.sort((a, b) => a.t - b.t);
  }, [comments, reactions]);

  function loadVideo(attempt = 0) {
    fetch(`${API}/api/watch/${id}`, { headers: authHeaders() })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (r.status === 401 && data.error === 'login_required') { setRec(data); setState('login'); return; }
        if (!r.ok) {
          // Just-uploaded videos can lag Cloudinary's index for a few seconds —
          // retry a few times before giving up so the page doesn't need a manual refresh.
          if (r.status === 404 && attempt < 6) { setTimeout(() => loadVideo(attempt + 1), 1500); return; }
          setState('notfound'); return;
        }
        if (data.requiresPassword) { setRec(data); setState('password'); return; }
        setRec(data); setState('ok'); afterLoad();
      })
      .catch(() => { if (attempt < 6) setTimeout(() => loadVideo(attempt + 1), 1500); else setState('notfound'); });
  }

  function afterLoad() {
    // count a view + load engagement
    fetch(`${API}/api/watch/${id}/view`, { method: 'POST', headers: authHeaders() })
      .then(r => r.json()).then(d => setViews(d.views)).catch(() => {});
    fetch(`${API}/api/watch/${id}/engagement`)
      .then(r => r.json()).then(d => { setViews(d.views); setReactions(d.reactions || []); setComments(d.comments || []); })
      .catch(() => {});
  }

  useEffect(() => { loadVideo(); /* eslint-disable-next-line */ }, [id]);

  // Reveal the player only once the video can actually play — until then show a
  // "processing" animation (a just-recorded video may still be finalising on
  // Cloudinary). A safety timeout guarantees the overlay never traps the viewer.
  useEffect(() => {
    if (state !== 'ok') { setVideoReady(false); return; }
    setVideoReady(false);
    let done = false;
    const ready = () => { if (!done) { done = true; setVideoReady(true); } };
    const v = videoRef.current;
    if (v) {
      if (v.readyState >= 2) ready();
      else { v.addEventListener('loadeddata', ready); v.addEventListener('canplay', ready); v.addEventListener('error', ready); }
    }
    const t = setTimeout(ready, 12000);
    return () => { if (v) { v.removeEventListener('loadeddata', ready); v.removeEventListener('canplay', ready); v.removeEventListener('error', ready); } clearTimeout(t); };
    /* eslint-disable-next-line */
  }, [state, id]);

  async function unlock(e) {
    e.preventDefault();
    setPwErr('');
    const res = await fetch(`${API}/api/watch/${id}/unlock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (!res.ok) { setPwErr(data.error || 'Wrong password'); return; }
    setRec(data); setState('ok'); afterLoad();
  }

  function copy(kind, text) {
    navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(''), 2000);
  }

  async function react(emoji) {
    const t = videoRef.current ? Math.floor(videoRef.current.currentTime) : null;
    const res = await fetch(`${API}/api/watch/${id}/react`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ emoji, t, name: commentName }),
    });
    const d = await res.json();
    if (res.ok) setReactions(d.reactions);
  }

  async function addComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    const t = atTime && videoRef.current ? Math.floor(videoRef.current.currentTime) : null;
    const res = await fetch(`${API}/api/watch/${id}/comment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text: commentText, name: commentName, t }),
    });
    const c = await res.json();
    if (res.ok) { setComments(cs => [...cs, c]); setCommentText(''); }
  }

  function seekTo(t) {
    if (videoRef.current != null && t != null) {
      videoRef.current.currentTime = t;
      videoRef.current.play();
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────
  if (state === 'notfound') return (
    <div className={styles.center}>
      <h2>Recording not found</h2>
      <Link to="/" className="btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>← Dashboard</Link>
    </div>
  );
  if (state === 'loading') return (
    <div className={styles.center}>
      <Loader2 size={34} className={styles.spin} style={{ color: '#5b5bf6' }} />
      <p style={{ marginTop: 14, color: '#9090a0' }}>Preparing your video…</p>
    </div>
  );

  if (state === 'login') return (
    <div className={styles.center}>
      <h2>🔒 Sign in to watch</h2>
      <p style={{ color: '#9090a0', margin: '10px 0 20px' }}>This video is restricted to signed-in users.</p>
      <Link to="/login" className="btn-primary">Sign in</Link>
    </div>
  );

  if (state === 'password') return (
    <div className={styles.center}>
      <h2>🔒 Password required</h2>
      <p style={{ color: '#9090a0', margin: '10px 0 16px' }}>“{rec?.title}” is password-protected.</p>
      <form onSubmit={unlock} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Enter password" autoFocus />
        {pwErr && <span style={{ color: '#ef4444', fontSize: 13 }}>{pwErr}</span>}
        <button className="btn-primary" type="submit">Unlock</button>
      </form>
    </div>
  );

  const src = rec.cloudinary ? rec.filename : `${API}/uploads/${rec.filename}`;
  // The HTML `download` attribute is ignored cross-origin (Cloudinary), so it
  // would just open the video. Cloudinary's fl_attachment forces a real download
  // with a Content-Disposition header and the correct file extension.
  const downloadUrl = (rec.cloudinary && src.includes('/upload/'))
    ? src.replace('/upload/', '/upload/fl_attachment/')
    : src;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const embedCode = `<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/embed/${id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
  const privacyLabel = { public: 'Anyone with the link', login: 'Signed-in users only', password: 'Password-protected' }[rec.privacy] || 'Anyone with the link';

  // ── Reusable bits ──────────────────────────────────────────────────────────
  const reactionsBar = (
    <div className={styles.reactions}>
      {REACTIONS.map(e => (
        <button key={e} className={styles.reactBtn} onClick={() => react(e)} title="React at the current moment">
          <span className={styles.emoji}>{e}</span>
          {reactionCounts[e] ? <span className={styles.reactCount}>{reactionCounts[e]}</span> : null}
        </button>
      ))}
    </div>
  );

  const activityPanel = (
    <div className={styles.panel}>
      <div className={styles.panelLabel}>Comments ({comments.length})</div>
      {rec.audience?.comments !== false ? (
        <form onSubmit={addComment} className={styles.commentForm}>
          {!user && (
            <input className={styles.commentName} value={commentName}
              onChange={e => setCommentName(e.target.value)} placeholder="Your name (optional)" />
          )}
          <textarea className={styles.commentInput} value={commentText}
            onChange={e => setCommentText(e.target.value)} placeholder="Add a comment…" rows={2} />
          <div className={styles.commentActions}>
            <label className={styles.atLabel}>
              <input type="checkbox" checked={atTime} onChange={e => setAtTime(e.target.checked)} />
              Tag current time
            </label>
            <button className="btn-primary" type="submit" style={{ fontSize: 13 }}>Comment</button>
          </div>
        </form>
      ) : (
        <p className={styles.noComments}>Comments are turned off for this video.</p>
      )}
      <div className={styles.commentList}>
        {comments.length === 0 && <p className={styles.noComments}>No comments yet — be the first.</p>}
        {comments.map(c => (
          <div key={c.id} className={styles.comment}>
            <div className={styles.commentHead}>
              <span className={styles.commentAuthor}>{c.name}</span>
              {c.t != null && (
                <button className={styles.timestamp} onClick={() => seekTo(c.t)}>@ {clock(c.t)}</button>
              )}
              <span className={styles.commentDate}>{new Date(c.at).toLocaleDateString()}</span>
            </div>
            <p className={styles.commentText}>{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // Genuinely-unbuilt features. These ship for nobody yet, so they always read
  // "Soon" and are non-interactive — never a dead click or a misleading upsell.
  const proBadge = <span className={styles.soonPill}>Soon</span>;
  const ProRow = ({ title, sub }) => (
    <div className={styles.audRow} aria-disabled="true">
      <div className={styles.audText}><strong>{title}</strong><span>{sub}</span></div>
      <span className={styles.soonPill}>Soon</span>
    </div>
  );

  const editPanel = (
    <div className={styles.panel}>
      {/* Upsell — only for free users */}
      {!isPaid && (
        <Link to="/pricing" className={styles.upsell}>
          <div className={styles.upsellIcon}><Crown size={18} /></div>
          <div className={styles.upsellText}>
            <strong>Get VeoRec Pro + AI</strong>
            <span>Remove branding, longer recordings, AI summaries & transcripts.</span>
          </div>
          <span className={styles.upsellBtn}>Upgrade</span>
        </Link>
      )}

      <div className={styles.panelLabel}>Make edits</div>
      <button className={styles.action} onClick={() => navigate(`/edit/${id}`)}>
        <span className={styles.actionIcon}><Scissors size={18} /></span>
        <span className={styles.actionText}>
          <strong>Edit &amp; trim video</strong>
          <span>Trim, split and cut parts of your recording.</span>
        </span>
      </button>
      <button className={styles.action} disabled style={{ opacity: .55, cursor: 'default' }}>
        <span className={styles.actionIcon}><Sparkles size={18} /></span>
        <span className={styles.actionText}>
          <strong>Remove silences &amp; filler words</strong>
          <span>Auto-clean your recording in one click.</span>
        </span>
        {proBadge}
      </button>

      <div className={styles.panelLabel} style={{ marginTop: 20 }}>Take action</div>
      <button className={styles.action} onClick={autoTitle} disabled={autoTitling}>
        <span className={styles.actionIcon}>{autoTitling ? <Loader2 size={18} className={styles.spin} /> : <Sparkles size={18} />}</span>
        <span className={styles.actionText}>
          <strong>{autoTitling ? 'Generating title…' : 'Auto-generate title'}</strong>
          <span>Name this video from its content — free &amp; unlimited.</span>
        </span>
      </button>
      <button className={styles.action} onClick={() => selectTab('transcript')}>
        <span className={styles.actionIcon}><FileText size={18} /></span>
        <span className={styles.actionText}>
          <strong>{segs.length ? 'View transcript' : 'Generate transcript'}</strong>
          <span>AI-generated, timestamped &amp; searchable.</span>
        </span>
      </button>
      <button className={styles.action} disabled style={{ opacity: .55, cursor: 'default' }}>
        <span className={styles.actionIcon}><Sparkles size={18} /></span>
        <span className={styles.actionText}>
          <strong>Generate documents with AI</strong>
          <span>Turn your video into summaries & docs.</span>
        </span>
        {proBadge}
      </button>
      <button className={styles.action} onClick={() => { setCtaOpen(o => !o); if (rec.cta) { setCtaLabel(rec.cta.label || ''); setCtaUrl(rec.cta.url || ''); } }}>
        <span className={styles.actionIcon}><Link2 size={18} /></span>
        <span className={styles.actionText}>
          <strong>{rec.cta ? 'Edit call-to-action link' : 'Add a link'}</strong>
          <span>Show a button under your video.</span>
        </span>
      </button>
      {ctaOpen && (
        <div className={styles.ctaForm}>
          <input className={styles.ctaInput} placeholder="Button text (e.g. Book a call)" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} />
          <input className={styles.ctaInput} placeholder="https://your-link.com" value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} />
          <div className={styles.ctaFormActions}>
            {rec.cta && <button className={styles.ctaRemove} onClick={removeCta}>Remove</button>}
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={saveCta}>Save link</button>
          </div>
        </div>
      )}
      {rec.audience?.download !== false && (
        <a className={styles.action} href={downloadUrl}>
          <span className={styles.actionIcon}><Download size={18} /></span>
          <span className={styles.actionText}>
            <strong>Download video</strong>
            <span>Save the original file to your device.</span>
          </span>
        </a>
      )}
    </div>
  );

  const aud = rec.audience || { comments: true, reactions: true, download: true, transcript: true };
  const SPEEDS = [{ v: null, l: 'Normal' }, { v: 1.25, l: '1.25×' }, { v: 1.5, l: '1.5×' }, { v: 1.75, l: '1.75×' }, { v: 2, l: '2×' }];
  const Toggle = ({ on, onClick }) => (
    <button type="button" role="switch" aria-checked={on} onClick={onClick}
      className={`${styles.switch} ${on ? styles.switchOn : ''}`}><span className={styles.switchKnob} /></button>
  );

  const settingsPanel = (
    <div className={styles.panel}>
      <div className={styles.subTabs}>
        <button className={`${styles.subTab} ${settingsSub === 'enhancements' ? styles.subTabActive : ''}`} onClick={() => setSettingsSub('enhancements')}>Enhancements</button>
        <button className={`${styles.subTab} ${settingsSub === 'audience' ? styles.subTabActive : ''}`} onClick={() => setSettingsSub('audience')}>Audience</button>
      </div>

      {settingsSub === 'audience' ? (
        <>
          <div className={styles.audRow}>
            <div className={styles.audText}><strong>Who can view</strong><span>Control who can open this link</span></div>
            <select className={styles.audSelect} value={rec.privacy || 'public'} onChange={e => savePrivacy(e.target.value)}>
              <option value="public">Anyone with the link</option>
              <option value="login">Signed-in users only</option>
            </select>
          </div>
          <div className={styles.audRow}>
            <div className={styles.audText}><strong>Recommended playback speed</strong><span>Suggest a viewing speed</span></div>
            <select className={styles.audSelect} value={rec.recommendedSpeed ?? ''} onChange={e => saveSpeed(e.target.value === '' ? null : Number(e.target.value))}>
              {SPEEDS.map(s => <option key={s.l} value={s.v ?? ''}>{s.l}</option>)}
            </select>
          </div>
          <div className={styles.audDivider} />
          <div className={styles.audRow}>
            <div className={styles.audText}><strong>Comments</strong><span>Allow viewers to add comments</span></div>
            <Toggle on={aud.comments !== false} onClick={() => saveAudience({ comments: aud.comments === false })} />
          </div>
          <div className={styles.audRow}>
            <div className={styles.audText}><strong>Emoji reactions</strong><span>Allow viewers to react</span></div>
            <Toggle on={aud.reactions !== false} onClick={() => saveAudience({ reactions: aud.reactions === false })} />
          </div>
          <div className={styles.audRow}>
            <div className={styles.audText}><strong>Download</strong><span>Allow viewers to download the video</span></div>
            <Toggle on={aud.download !== false} onClick={() => saveAudience({ download: aud.download === false })} />
          </div>
          <div className={styles.audRow}>
            <div className={styles.audText}><strong>Transcript</strong><span>Allow viewers to open the transcript</span></div>
            <Toggle on={aud.transcript !== false} onClick={() => saveAudience({ transcript: aud.transcript === false })} />
          </div>
          <div className={styles.audDivider} />
          <div className={styles.panelLabel}>Embed</div>
          <code className={styles.embedCode}>{embedCode}</code>
          <button className="btn-ghost" style={{ width: '100%' }} onClick={() => copy('embed', embedCode)}>
            {copied === 'embed' ? '✓ Copied!' : <><Code2 size={14} /> Copy embed code</>}
          </button>
        </>
      ) : (
        <>
          <div className={styles.audRow}>
            <div className={styles.audText}><strong>Animated thumbnail</strong><span>Auto-generated preview when shared</span></div>
            <Toggle on={rec.animatedThumbnail !== false} onClick={() => saveThumb(rec.animatedThumbnail === false)} />
          </div>
          <ProRow title="Custom thumbnail" sub="Upload your own cover image" />
          <ProRow title="Background noise filter" sub="Clean up audio automatically" />
          <ProRow title="Remove silences & filler words" sub="Auto-tighten your recording" />
        </>
      )}
    </div>
  );

  const transcriptPanel = (
    <div className={styles.panel}>
      {segs.length > 0 ? (
        <>
          <div className={styles.tSearchRow}>
            <Search size={15} />
            <input className={styles.tSearch} placeholder="Search transcript…" value={tQuery} onChange={e => setTQuery(e.target.value)} />
            {isOwner && (
              <button className={styles.tRegen} title="Regenerate transcript" disabled={transcribing} onClick={generateTranscript}>
                {transcribing ? <Loader2 size={15} className={styles.spin} /> : <RefreshCw size={15} />}
              </button>
            )}
          </div>
          <div className={styles.tList}>
            {filteredSegs.length === 0 && <p className={styles.noComments}>No lines match “{tQuery}”.</p>}
            {filteredSegs.map(seg => (
              <button
                key={seg.i}
                ref={seg.i === activeSegIdx ? activeSegRef : null}
                className={`${styles.tLine} ${seg.i === activeSegIdx ? styles.tLineActive : ''}`}
                onClick={() => seekTo(seg.start)}
              >
                <span className={styles.tTime}>{clock(seg.start)}</span>
                <span className={styles.tText}>{seg.text}</span>
              </button>
            ))}
          </div>
        </>
      ) : transcribing ? (
        <div className={styles.tEmpty}>
          <Loader2 size={26} className={styles.spin} />
          <strong>Transcribing your video…</strong>
          <span>Whisper is listening — this usually takes a few seconds.</span>
        </div>
      ) : (
        <div className={styles.tEmpty}>
          <FileText size={26} />
          <strong>No transcript yet</strong>
          {isOwner ? (
            !canTranscribe ? (
              <>
                <span>AI transcription is a <strong>Pro</strong> feature — auto-generate a timestamped, searchable transcript for every video.</span>
                <Link to="/pricing" className="btn-primary" style={{ marginTop: 12 }}>
                  <Crown size={15} /> Upgrade to Pro
                </Link>
              </>
            ) : transcript && transcript.configured === false ? (
              <span>Transcription isn’t available on this server yet — it’ll appear here once the latest deploy is live.</span>
            ) : (
              <>
                <span>Generate a timestamped, searchable transcript with AI.</span>
                <button className="btn-primary" style={{ marginTop: 12 }} disabled={transcribing} onClick={generateTranscript}>
                  <Sparkles size={15} /> Generate transcript
                </button>
              </>
            )
          ) : (
            <span>The owner hasn’t added a transcript for this video yet.</span>
          )}
          {transcriptErr && <span className={styles.tErr}>{transcriptErr}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}><img src="/logo.png" className={styles.logoImg} alt="" />VeoRec</Link>
        <div className={styles.headerActions}>
          {/* Segmented Share button (label + attached copy-link icon) */}
          <div className={styles.shareGroup}>
            <button className={styles.shareBtn} onClick={() => copy('link', shareUrl)}>
              {copied === 'link' ? <><Check size={15} /> Copied!</> : <><Share2 size={15} /> Share</>}
            </button>
            <button className={styles.shareIcon} title="Copy link" onClick={() => copy('link', shareUrl)}>
              <Link2 size={15} />
            </button>
          </div>

          {/* More (⋯) menu */}
          <div className={styles.moreWrap}>
            <button className={styles.iconBtn} title="More" aria-label="More options" onClick={() => setMenuOpen(o => !o)}>
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <>
                <div className={styles.menuBackdrop} onClick={() => { setMenuOpen(false); setMoveOpen(false); }} />
                <div className={styles.menu}>
                  {isOwner && (
                    <button className={styles.menuItem} onClick={() => { setMenuOpen(false); navigate(`/edit/${id}`); }}>
                      <Scissors size={15} /> Edit / Trim
                    </button>
                  )}
                  {rec.audience?.download !== false && (
                    <a className={styles.menuItem} href={downloadUrl} onClick={() => setMenuOpen(false)}>
                      <Download size={15} /> Download
                    </a>
                  )}
                  <button className={styles.menuItem} onClick={() => { setMenuOpen(false); copy('embed', embedCode); }}>
                    <Code2 size={15} /> Copy embed code
                  </button>
                  {isOwner && (
                    <>
                      <div className={styles.menuSub}>
                        <button className={styles.menuItem} onClick={() => setMoveOpen(o => !o)}>
                          <FolderInput size={15} /> Move to folder
                        </button>
                        {moveOpen && (
                          <div className={styles.subMenu}>
                            <button className={styles.menuItem} onClick={() => moveToFolder(null)}>No folder</button>
                            {folders.map((f) => (
                              <button key={f.id} className={styles.menuItem} onClick={() => moveToFolder(f.id)}>{f.name}</button>
                            ))}
                            {!folders.length && <span className={styles.menuEmpty}>No folders yet</span>}
                          </div>
                        )}
                      </div>
                      <button className={styles.menuItem} onClick={duplicateVideo}>
                        <CopyPlus size={15} /> Duplicate
                      </button>
                      <button className={styles.menuItem} onClick={() => { setMenuOpen(false); saveArchived(!rec.archived); }}>
                        {rec.archived ? <><ArchiveRestore size={15} /> Unarchive</> : <><Archive size={15} /> Archive</>}
                      </button>
                      <div className={styles.menuDivider} />
                      <button className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => { setMenuOpen(false); deleteVideo(); }}>
                        <Trash2 size={15} /> Delete
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Account avatar dropdown (signed-in only) */}
          {user && (
            <div className={styles.moreWrap}>
              <button className={styles.avatar} title={user.name || user.email || 'Account'} onClick={() => setAvatarOpen(o => !o)}>
                {(user.name || user.email || 'U').charAt(0).toUpperCase()}
              </button>
              {avatarOpen && (
                <>
                  <div className={styles.menuBackdrop} onClick={() => setAvatarOpen(false)} />
                  <div className={styles.menu}>
                    <div className={styles.menuUser}><strong>{user.name}</strong><small>{user.email}</small></div>
                    <Link className={styles.menuItem} to="/" onClick={() => setAvatarOpen(false)}><PlaySquare size={15} /> My library</Link>
                    <Link className={styles.menuItem} to="/account" onClick={() => setAvatarOpen(false)}><UserIcon size={15} /> My account</Link>
                    <Link className={styles.menuItem} to="/contact" onClick={() => setAvatarOpen(false)}><HelpCircle size={15} /> Help &amp; support</Link>
                    {user.isAdmin && <Link className={styles.menuItem} to="/admin" onClick={() => setAvatarOpen(false)}><BarChart3 size={15} /> Admin panel</Link>}
                    <div className={styles.menuDivider} />
                    <button className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => { setAvatarOpen(false); logout(); }}><LogOut size={15} /> Log out</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <main className={styles.layout}>
        {/* ── Left: title + player + summary ──────────────────────────────── */}
        <div className={styles.left}>
          {/* Title block (Loom-style, above the video) */}
          <div className={styles.titleTop}>
            <div className={styles.titleMain}>
              {isOwner && renaming ? (
                <div className={styles.renameRow}>
                  <input className={styles.renameInput} value={renameVal} autoFocus
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false); }} />
                  <button className="btn-primary" onClick={saveRename}>Save</button>
                  <button className="btn-ghost" onClick={() => setRenaming(false)}>Cancel</button>
                </div>
              ) : (
                <h1 className={styles.title}>
                  {rec.title}
                  {isOwner && (
                    <button className={styles.titleEdit} title="Rename" onClick={() => { setRenameVal(rec.title); setRenaming(true); }}><Pencil size={15} /></button>
                  )}
                </h1>
              )}
              <p className={styles.byline}>{rec.author ? `${rec.author} · ` : ''}{timeAgo(rec.created_at)} · {fmt(rec.duration)}</p>
            </div>
            <div className={styles.moreWrap}>
              <button className={styles.viewsPill} onClick={() => { setViewsOpen(o => !o); if (!viewers && isOwner) loadViewers(); }}>
                <Eye size={15} /> {views} view{views === 1 ? '' : 's'}
              </button>
              {viewsOpen && (
                <>
                  <div className={styles.menuBackdrop} onClick={() => setViewsOpen(false)} />
                  <div className={styles.viewsPopup}>
                    <div className={styles.viewsHead}>Views</div>
                    <div className={styles.viewsStat}>
                      {views} total view{views === 1 ? '' : 's'}
                      {viewers ? `, ${new Set(viewers.map(v => v.email || v.name || Math.random())).size} signed-in viewer${new Set(viewers.map(v => v.email || v.name)).size === 1 ? '' : 's'}` : ''}
                    </div>
                    {isOwner ? (
                      viewers ? (
                        <div className={styles.viewerList}>
                          {viewers.length === 0 && <p className={styles.blockEmpty}>No signed-in viewers yet — anonymous views still count above.</p>}
                          {viewers.map((v, i) => (
                            <div key={i} className={styles.viewerRow}>
                              <span className={styles.viewerAvatar}>{(v.name || 'A').charAt(0).toUpperCase()}</span>
                              <span className={styles.viewerName}>{v.name || 'Anonymous'}</span>
                              <span className={styles.viewerTime}>{timeAgo(v.at)}</span>
                            </div>
                          ))}
                        </div>
                      ) : <p className={styles.blockEmpty}>Loading…</p>
                    ) : (
                      <p className={styles.blockEmpty}>Detailed viewer insights are visible to the owner.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Custom player — reaction/comment markers sit ON the progress bar */}
          <div style={{ position: 'relative' }}>
            <VideoPlayer
              videoRef={videoRef}
              src={src}
              segments={Array.isArray(rec.segments) && rec.segments.length ? rec.segments : null}
              trimStart={rec.trimStart}
              trimEnd={rec.trimEnd}
              recommendedSpeed={rec.recommendedSpeed}
              markers={markers.filter(m => m.kind === 'comment'
                ? rec.audience?.comments !== false
                : rec.audience?.reactions !== false)}
              captions={(isOwner || rec.audience?.transcript !== false) ? (transcript?.segments || []) : []}
              onMarkerClick={seekTo}
              onTime={setVideoTime}
              branding={rec.branding}
            />
            {!videoReady && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 6, borderRadius: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: 'rgba(15,15,25,0.86)', backdropFilter: 'blur(2px)',
              }}>
                <Loader2 size={40} className={styles.spin} style={{ color: '#fff' }} />
                <strong style={{ color: '#fff', fontSize: 15 }}>Processing your video…</strong>
                <span style={{ color: '#c7c7d6', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
                  This usually takes a few seconds — it’ll start playing automatically.
                </span>
              </div>
            )}
          </div>

          {/* Loom-style floating reaction dock */}
          {(rec.audience?.reactions !== false || rec.audience?.comments !== false) && (
            <div className={styles.reactionDock}>
              {rec.audience?.reactions !== false && (
                <div className={styles.reactionPill}>
                  {REACTIONS.map(e => (
                    <button key={e} className={styles.reactDockBtn} title="React at this moment" onClick={() => react(e)}>{e}</button>
                  ))}
                </div>
              )}
              {rec.audience?.comments !== false && (
                <button className={styles.commentDock} onClick={openCommentDock}>
                  <MessageSquare size={17} /> Comment
                </button>
              )}
            </div>
          )}

          {/* Inline comment composer (Loom-style) */}
          {commentDockOpen && rec.audience?.comments !== false && (
            <div className={styles.composer}>
              {!user && (
                <input className={styles.composerName} value={commentName}
                  onChange={e => setCommentName(e.target.value)} placeholder="Your name (optional)" />
              )}
              <textarea className={styles.composerInput} value={commentText} autoFocus rows={2}
                placeholder="Add a comment…"
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postDockComment(); if (e.key === 'Escape') setCommentDockOpen(false); }} />
              <div className={styles.composerActions}>
                <button className={styles.composerCancel} onClick={() => { setCommentDockOpen(false); setCommentText(''); }}>Cancel</button>
                <button className={styles.composerSend} onClick={postDockComment} disabled={!commentText.trim()}>
                  Comment at {clock(Math.floor(videoTime || 0))}
                </button>
              </div>
            </div>
          )}

          <div className={styles.info}>
            {rec.cta && rec.cta.url && (
              <a className={styles.cta} href={rec.cta.url} target="_blank" rel="noopener noreferrer">
                {rec.cta.label || 'Learn more'} →
              </a>
            )}

            {/* Summary */}
            <section className={styles.belowBlock}>
              <h3 className={styles.blockTitle}>Summary</h3>
              {isOwner ? (
                <textarea className={styles.summaryInput} placeholder="Add a summary…" rows={2}
                  value={summaryDraft ?? rec.description ?? ''}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  onBlur={() => saveSummary(summaryDraft ?? '')} />
              ) : rec.description ? (
                <p className={styles.desc}>{rec.description}</p>
              ) : (
                <p className={styles.blockEmpty}>No summary added.</p>
              )}
            </section>

            {/* Tags */}
            <section className={styles.belowBlock}>
              <h3 className={styles.blockTitle}>Tags</h3>
              <div className={styles.tagRow}>
                {(rec.tags || []).map(t => (
                  <span key={t} className={styles.tagChip}>
                    #{t}
                    {isOwner && <button className={styles.tagX} title="Remove" onClick={() => removeTag(t)}><X size={11} /></button>}
                  </span>
                ))}
                {isOwner ? (
                  <input className={styles.tagInput} placeholder="# add tag" value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
                    onBlur={() => addTag(tagInput)} />
                ) : (!rec.tags || !rec.tags.length) ? (
                  <span className={styles.blockEmpty}>No tags.</span>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        {/* ── Right: Loom-style sidebar ───────────────────────────────────── */}
        <aside className={styles.sidebar}>
          <div className={styles.tabs}>
            {isOwner && (
              <button className={`${styles.tab} ${tab === 'edit' ? styles.tabActive : ''}`} onClick={() => selectTab('edit')} title="Make edits">
                <Pencil size={16} /> <span>Edit</span>
              </button>
            )}
            <button className={`${styles.tab} ${tab === 'activity' ? styles.tabActive : ''}`} onClick={() => selectTab('activity')} title="Activity">
              <ActivityIcon size={16} /> <span>Activity</span>
            </button>
            {(isOwner || rec.audience?.transcript !== false) && (
              <button className={`${styles.tab} ${tab === 'transcript' ? styles.tabActive : ''}`} onClick={() => selectTab('transcript')} title="Transcript">
                <FileText size={16} /> <span>Transcript</span>
              </button>
            )}
            {isOwner && (
              <button className={`${styles.tab} ${tab === 'settings' ? styles.tabActive : ''}`} onClick={() => selectTab('settings')} title="Settings">
                <SettingsIcon size={16} /> <span>Settings</span>
              </button>
            )}
          </div>

          {tab === 'edit' && isOwner && editPanel}
          {tab === 'activity' && activityPanel}
          {tab === 'transcript' && transcriptPanel}
          {tab === 'settings' && isOwner && settingsPanel}

          {!isOwner && (
            <Link to="/" className={styles.madeWith}>
              <img src="/logo.png" className={styles.logoImg} alt="" />
              <span><strong>Made with VeoRec</strong><br />Record your screen free →</span>
            </Link>
          )}
        </aside>
      </main>
    </div>
  );
}
