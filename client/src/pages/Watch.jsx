import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import styles from './Watch.module.css';
import API from '../api';
import { useAuth } from '../AuthContext';

const REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '👏'];

function fmt(s) {
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
  const videoRef = useRef(null);

  const [rec, setRec] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | notfound | login | password
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [copied, setCopied] = useState('');

  const [views, setViews] = useState(0);
  const [reactions, setReactions] = useState([]);   // [{emoji, t, at}]
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentName, setCommentName] = useState('');
  const [atTime, setAtTime] = useState(true);
  const [dur, setDur] = useState(0);                // real video duration (s)

  // reaction tallies for the bar
  const reactionCounts = useMemo(() => {
    const c = {};
    (reactions || []).forEach(r => { c[r.emoji] = (c[r.emoji] || 0) + 1; });
    return c;
  }, [reactions]);

  // markers on the timeline: comments + reactions that have a timestamp
  const markers = useMemo(() => {
    const m = [];
    (comments || []).forEach(c => { if (c.t != null) m.push({ kind: 'comment', t: c.t, label: c.name + ': ' + c.text }); });
    (reactions || []).forEach(r => { if (r.t != null) m.push({ kind: 'react', t: r.t, label: r.emoji, emoji: r.emoji }); });
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
      .then(r => r.json()).then(d => { setViews(d.views); setReactions(d.reactions || {}); setComments(d.comments || []); })
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}><img src="/logo.png" className={styles.logoImg} alt="" />VeoRec</Link>
        <div className={styles.headerActions}>
          <button className="btn-primary" onClick={() => copy('link', window.location.href)}>
            {copied === 'link' ? '✓ Copied!' : '🔗 Copy link'}
          </button>
          <a href={src} download={rec.title + '.webm'} className="btn-ghost">↓ Download</a>
        </div>
      </header>

      <main className={styles.main}>
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
              const segs = Array.isArray(rec.segments) && rec.segments.length ? rec.segments : null;
              if (segs) {
                // Play only kept segments — skip cut gaps; loop at the end.
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
                v.currentTime = start;   // loop back to trimmed start
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

        {/* CTA */}
        {rec.cta && rec.cta.url && (
          <a className={styles.cta} href={rec.cta.url} target="_blank" rel="noopener noreferrer">
            {rec.cta.label || 'Learn more'} →
          </a>
        )}

        <div className={styles.info}>
          <h1 className={styles.title}>{rec.title}</h1>
          <p className={styles.meta}>
            👁 {views} view{views === 1 ? '' : 's'} · {new Date(rec.created_at).toLocaleString()} · {fmt(rec.duration)}
          </p>
          {rec.description && <p className={styles.desc}>{rec.description}</p>}
        </div>

        {/* Reactions */}
        <div className={styles.reactions}>
          {REACTIONS.map(e => (
            <button key={e} className={styles.reactBtn} onClick={() => react(e)} title="React at the current moment">
              <span className={styles.emoji}>{e}</span>
              {reactionCounts[e] ? <span className={styles.reactCount}>{reactionCounts[e]}</span> : null}
            </button>
          ))}
        </div>

        {/* Embed */}
        <details className={styles.embed}>
          <summary>{'<> Embed this video'}</summary>
          <code className={styles.embedCode}>
            {`<iframe src="${window.location.origin}/embed/${id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`}
          </code>
          <button className="btn-ghost" onClick={() => copy('embed',
            `<iframe src="${window.location.origin}/embed/${id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`)}>
            {copied === 'embed' ? '✓ Copied!' : 'Copy embed code'}
          </button>
        </details>

        {/* Comments */}
        <section className={styles.comments}>
          <h3 className={styles.commentsTitle}>Comments ({comments.length})</h3>
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
        </section>
      </main>
    </div>
  );
}
