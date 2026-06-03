import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import API from '../api';

// Minimal player for iframe embeds — just the video, no chrome.
export default function Embed() {
  const { id } = useParams();
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/watch/${id}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.requiresPassword) { setErr(true); return; }
        setRec(d);
        fetch(`${API}/api/watch/${id}/view`, { method: 'POST' }).catch(() => {});
      })
      .catch(() => setErr(true));
  }, [id]);

  const wrap = { margin: 0, background: '#000', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  if (err) return <div style={{ ...wrap, color: '#888', fontFamily: 'system-ui' }}>Video unavailable</div>;
  if (!rec) return <div style={{ ...wrap, color: '#888', fontFamily: 'system-ui' }}>Loading…</div>;

  const src = rec.cloudinary ? rec.filename : `${API}/uploads/${rec.filename}`;
  return (
    <div style={wrap}>
      <video
        ref={videoRef}
        src={src}
        controls
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onLoadedMetadata={(e) => {
          const v = e.target;
          const start = Number(rec.trimStart) || 0;
          if (v.duration === Infinity || isNaN(v.duration)) {
            v.currentTime = 1e101;
            v.ontimeupdate = () => { v.ontimeupdate = null; v.currentTime = start; };
          } else if (start) {
            v.currentTime = start;
          }
        }}
        onTimeUpdate={(e) => {
          const v = e.target;
          if (rec.trimEnd != null && v.currentTime >= rec.trimEnd) {
            v.pause(); v.currentTime = Number(rec.trimStart) || 0;
          }
        }}
      />
    </div>
  );
}
