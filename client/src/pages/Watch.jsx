import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import styles from './Watch.module.css';
import API from '../api';

function fmt(s) {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export default function Watch() {
  const { id } = useParams();
  const [rec, setRec] = useState(null);
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/recordings/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setRec)
      .catch(() => setNotFound(true));
  }, [id]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (notFound) return (
    <div className={styles.center}>
      <h2>Recording not found</h2>
      <Link to="/" className="btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>← Dashboard</Link>
    </div>
  );

  if (!rec) return <div className={styles.center}><p>Loading…</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.dot} />
          ScreenRec
        </Link>
        <div className={styles.headerActions}>
          <button className="btn-primary" onClick={copyLink}>
            {copied ? '✓ Link copied!' : '🔗 Copy shareable link'}
          </button>
          <a
            href={rec.cloudinary ? rec.filename : `${API}/uploads/${rec.filename}`}
            download={rec.title + '.webm'}
            className="btn-ghost"
          >
            ↓ Download
          </a>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.player}>
          <video
            src={rec.cloudinary ? rec.filename : `${API}/uploads/${rec.filename}`}
            controls
            autoPlay
            className={styles.video}
            onLoadedMetadata={(e) => {
              const v = e.target;
              if (v.duration === Infinity || isNaN(v.duration)) {
                // WebM recorded via MediaRecorder lacks duration metadata.
                // Seek to a huge time to force the browser to scan the file.
                v.currentTime = 1e101;
                v.ontimeupdate = () => {
                  v.ontimeupdate = null;
                  v.currentTime = 0;
                };
              }
            }}
          />
        </div>
        <div className={styles.info}>
          <h1 className={styles.title}>{rec.title}</h1>
          <p className={styles.meta}>
            {new Date(rec.created_at).toLocaleString()} · {fmt(rec.duration)}
          </p>
        </div>
      </main>
    </div>
  );
}
