import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Scissors, Sparkles, Link2, Download, Settings as SettingsIcon,
  Activity as ActivityIcon, Pencil, Code2, Crown, Share2, Check,
  FileText, Search, Loader2, RefreshCw, MoreHorizontal } from 'lucide-react';
import styles from './Watch.module.css';
import API from '../api';
import { useAuth } from '../AuthContext';

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
function authHeaders() {
  const t = localStorage.getItem('sr_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function Watch() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);

  const [rec, setRec] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | notfound | login | password
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [copied, setCopied] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);   // header "more" (⋯) menu

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
    reactionsArr.forEach(r => { if (r.t != null) m.push({ kind: 'react', t: r.t, label: r.emoji, emoji: r.emoji }); });
    return m.sort((a, b) => a.t - b.t);
  }, [comments, reactions]);

  function loadVideo() {
    fetch(`${API}/api/watch/${id}`, { headers: authHeaders() })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (r.status === 401 && data.error === 'login_required') { setRec(data); setState('login'); return; }
        if (!r.ok) { setState('notfound'); return; }
        if (data.requiresPassword) { setRec(data); setState('password'); return; }
        setRec(data); setState('ok'); afterLoad();
      })
      .catch(() => setState('notfound'));
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji, t }),
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
  if (state === 'loading') return <div className={styles.center}><p>Loading…</p></div>;

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
      <div className={styles.panelLabel}>React</div>
      {reactionsBar}
      <div className={styles.panelLabel} style={{ marginTop: 22 }}>Comments ({comments.length})</div>
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

  const editPanel = (
    <div className={styles.panel}>
      {/* Upsell */}
      <Link to="/pricing" className={styles.upsell}>
        <div className={styles.upsellIcon}><Crown size={18} /></div>
        <div className={styles.upsellText}>
          <strong>Get VeoRec Pro + AI</strong>
          <span>Remove branding, longer recordings, AI summaries & transcripts.</span>
        </div>
        <span className={styles.upsellBtn}>Upgrade</span>
      </Link>

      <div className={styles.panelLabel}>Make edits</div>
      <button className={styles.action} onClick={() => navigate(`/edit/${id}`)}>
        <span className={styles.actionIcon}><Scissors size={18} /></span>
        <span className={styles.actionText}>
          <strong>Edit &amp; trim video</strong>
          <span>Trim, split and cut parts of your recording.</span>
        </span>
      </button>
      <button className={styles.action} onClick={() => navigate('/pricing')}>
        <span className={styles.actionIcon}><Sparkles size={18} /></span>
        <span className={styles.actionText}>
          <strong>Remove silences &amp; filler words</strong>
          <span>Auto-clean your recording in one click.</span>
        </span>
        <span className={styles.proPill}>Pro</span>
      </button>

      <div className={styles.panelLabel} style={{ marginTop: 20 }}>Take action</div>
      <button className={styles.action} onClick={() => selectTab('transcript')}>
        <span className={styles.actionIcon}><FileText size={18} /></span>
        <span className={styles.actionText}>
          <strong>{segs.length ? 'View transcript' : 'Generate transcript'}</strong>
          <span>AI-generated, timestamped &amp; searchable.</span>
        </span>
      </button>
      <button className={styles.action} onClick={() => navigate('/pricing')}>
        <span className={styles.actionIcon}><Sparkles size={18} /></span>
        <span className={styles.actionText}>
          <strong>Generate documents with AI</strong>
          <span>Turn your video into summaries & docs.</span>
        </span>
        <span className={styles.proPill}>Pro</span>
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
      <a className={styles.action} href={src} download={rec.title + '.webm'}>
        <span className={styles.actionIcon}><Download size={18} /></span>
        <span className={styles.actionText}>
          <strong>Download video</strong>
          <span>Save the original file to your device.</span>
        </span>
      </a>
    </div>
  );

  const settingsPanel = (
    <div className={styles.panel}>
      <div className={styles.panelLabel}>Sharing</div>
      <div className={styles.settingRow}>
        <span>Who can view</span>
        <strong>{privacyLabel}</strong>
      </div>
      <button className={styles.action} onClick={() => copy('link', shareUrl)}>
        <span className={styles.actionIcon}><Link2 size={18} /></span>
        <span className={styles.actionText}>
          <strong>{copied === 'link' ? 'Link copied ✓' : 'Copy share link'}</strong>
          <span>{shareUrl}</span>
        </span>
      </button>

      <div className={styles.panelLabel} style={{ marginTop: 20 }}>Embed</div>
      <code className={styles.embedCode}>{embedCode}</code>
      <button className="btn-ghost" style={{ width: '100%' }} onClick={() => copy('embed', embedCode)}>
        {copied === 'embed' ? '✓ Copied!' : <><Code2 size={14} /> Copy embed code</>}
      </button>
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
                <div className={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
                <div className={styles.menu}>
                  {isOwner && (
                    <button className={styles.menuItem} onClick={() => { setMenuOpen(false); navigate(`/edit/${id}`); }}>
                      <Scissors size={15} /> Edit / Trim
                    </button>
                  )}
                  <a className={styles.menuItem} href={src} download={rec.title + '.webm'} onClick={() => setMenuOpen(false)}>
                    <Download size={15} /> Download
                  </a>
                  <button className={styles.menuItem} onClick={() => { setMenuOpen(false); copy('embed', embedCode); }}>
                    <Code2 size={15} /> Copy embed code
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Account avatar (signed-in only) */}
          {user && (
            <Link to="/" className={styles.avatar} title={user.name || user.email || 'Your library'}>
              {(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </Link>
          )}
        </div>
      </header>

      <main className={styles.layout}>
        {/* ── Left: player + info ─────────────────────────────────────────── */}
        <div className={styles.left}>
          <div className={styles.player}>
            <video
              ref={videoRef}
              src={src}
              controls
              autoPlay
              className={styles.video}
              onLoadedMetadata={(e) => {
                const v = e.target;
                const segs = Array.isArray(rec.segments) && rec.segments.length ? rec.segments : null;
                const start = segs ? segs[0].start : (Number(rec.trimStart) || 0);
                if (v.duration === Infinity || isNaN(v.duration)) {
                  v.currentTime = 1e101;
                  v.ontimeupdate = () => {
                    v.ontimeupdate = null; v.currentTime = start;
                    if (Number.isFinite(v.duration)) setDur(v.duration);
                  };
                } else {
                  if (start) v.currentTime = start;
                  setDur(v.duration);
                }
              }}
              onTimeUpdate={(e) => {
                const v = e.target;
                setVideoTime(v.currentTime);
                const segs = Array.isArray(rec.segments) && rec.segments.length ? rec.segments : null;
                if (segs) {
                  const t = v.currentTime;
                  const inSeg = segs.find((sg) => t >= sg.start - 0.05 && t < sg.end);
                  if (!inSeg) {
                    const next = segs.find((sg) => sg.start > t);
                    if (next) v.currentTime = next.start;
                    else { v.pause(); v.currentTime = segs[0].start; }
                  }
                  return;
                }
                const start = Number(rec.trimStart) || 0;
                if (rec.trimEnd != null && v.currentTime >= rec.trimEnd) {
                  v.pause();
                  v.currentTime = start;
                }
              }}
            />
          </div>

          {/* Timeline markers (comments + reactions) */}
          {markers.length > 0 && (dur || rec.duration) > 0 && (
            <div className={styles.timeline} title="Comments & reactions">
              {markers.map((m, i) => (
                <button
                  key={i}
                  className={m.kind === 'comment' ? styles.markerComment : styles.markerReact}
                  style={{ left: `${Math.min(99, (m.t / (dur || rec.duration)) * 100)}%` }}
                  title={m.label}
                  onClick={() => seekTo(m.t)}
                >
                  {m.kind === 'comment' ? '💬' : m.emoji}
                </button>
              ))}
            </div>
          )}

          <div className={styles.info}>
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
            <p className={styles.meta}>
              👁 {views} view{views === 1 ? '' : 's'} · {new Date(rec.created_at).toLocaleDateString()} · {fmt(rec.duration)}
            </p>
            {rec.description && <p className={styles.desc}>{rec.description}</p>}
            {rec.cta && rec.cta.url && (
              <a className={styles.cta} href={rec.cta.url} target="_blank" rel="noopener noreferrer">
                {rec.cta.label || 'Learn more'} →
              </a>
            )}
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
            <button className={`${styles.tab} ${tab === 'transcript' ? styles.tabActive : ''}`} onClick={() => selectTab('transcript')} title="Transcript">
              <FileText size={16} /> <span>Transcript</span>
            </button>
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
