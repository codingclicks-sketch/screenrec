import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Play, Pause, Scissors, Trash2, RotateCcw, ArrowLeft, Save, SkipBack, SkipForward } from 'lucide-react';
import { useAuth } from '../AuthContext';
import API from '../api';
import s from './Editor.module.css';

function fmt(t) {
  if (!isFinite(t)) t = 0;
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// The editor works in "keep-segments": an ordered list of {start,end} ranges to
// keep. Splitting divides a segment; deleting removes one; the preview plays only
// the kept ranges (skipping cut gaps). Saved virtually — no re-encoding.
export default function Editor() {
  const { id } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const trackRef = useRef(null);

  const [rec, setRec] = useState(null);
  const [duration, setDuration] = useState(0);
  const [segments, setSegments] = useState([]); // [{start,end}]
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [drag, setDrag] = useState(null); // { segIndex, edge } while dragging a handle
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportMsg, setExportMsg] = useState('');
  const [indeterminate, setIndeterminate] = useState(false);

  useEffect(() => {
    authFetch(`${API}/api/recordings/${id}`).then((r) => r.json()).then((d) => {
      setRec(d);
      const dur = d.duration || 0;
      setDuration(dur);
      if (Array.isArray(d.segments) && d.segments.length) setSegments(d.segments);
      else {
        const start = d.trimStart != null ? d.trimStart : 0;
        const end = d.trimEnd != null ? d.trimEnd : dur;
        setSegments([{ start, end: end || dur }]);
      }
    }).catch(() => {});
  }, [id]);

  // When metadata loads, prefer the real measured duration.
  function onMeta() {
    const v = videoRef.current;
    if (v && isFinite(v.duration) && v.duration > 0) {
      setDuration(v.duration);
      setSegments((segs) => (segs.length ? segs.map((sg, i) => (i === segs.length - 1 && (!sg.end || sg.end > v.duration) ? { ...sg, end: v.duration } : sg)) : [{ start: 0, end: v.duration }]));
    }
  }

  // ── Playback that skips cut gaps ──────────────────────────────────────────────
  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    setPlayhead(t);
    // Find the kept segment we're in; if in a gap, jump to next segment start.
    const inSeg = segments.find((sg) => t >= sg.start - 0.05 && t < sg.end);
    if (!inSeg) {
      const next = segments.find((sg) => sg.start > t);
      if (next) { v.currentTime = next.start; }
      else { v.pause(); setPlaying(false); v.currentTime = segments[0]?.start || 0; }
    }
  }

  function togglePlay() {
    const v = videoRef.current; if (!v) return;
    if (v.paused) {
      // start from first kept segment if outside
      if (!segments.some((sg) => v.currentTime >= sg.start && v.currentTime < sg.end)) v.currentTime = segments[0]?.start || 0;
      v.play(); setPlaying(true);
    } else { v.pause(); setPlaying(false); }
  }

  function seekTo(t) {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, t));
    setPlayhead(v.currentTime);
  }

  // px ↔ seconds on the timeline track
  function clientXToTime(clientX) {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function onTrackClick(e) {
    if (drag) return;
    seekTo(clientXToTime(e.clientX));
  }

  // ── Edits ─────────────────────────────────────────────────────────────────────
  function splitAtPlayhead() {
    const t = playhead;
    setSegments((segs) => {
      const i = segs.findIndex((sg) => t > sg.start + 0.2 && t < sg.end - 0.2);
      if (i === -1) return segs;
      const sg = segs[i];
      const next = [...segs];
      next.splice(i, 1, { start: sg.start, end: t }, { start: t, end: sg.end });
      return next;
    });
  }
  function deleteSegment(i) {
    setSegments((segs) => (segs.length <= 1 ? segs : segs.filter((_, idx) => idx !== i)));
  }
  function resetEdits() {
    setSegments([{ start: 0, end: duration }]);
  }

  // Drag a segment edge (trim handle)
  useEffect(() => {
    if (!drag) return;
    function move(e) {
      const t = clientXToTime(e.clientX);
      setSegments((segs) => segs.map((sg, i) => {
        if (i !== drag.segIndex) return sg;
        if (drag.edge === 'start') return { ...sg, start: Math.max(i > 0 ? segs[i - 1].end : 0, Math.min(t, sg.end - 0.3)) };
        return { ...sg, end: Math.min(i < segs.length - 1 ? segs[i + 1].start : duration, Math.max(t, sg.start + 0.3)) };
      }));
    }
    function up() { setDrag(null); }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [drag, duration]);

  const keptDuration = useMemo(() => segments.reduce((a, sg) => a + (sg.end - sg.start), 0), [segments]);

  // Seek a media element and resolve once the frame is ready.
  function seek(video, t) {
    return new Promise((res) => {
      const on = () => { video.removeEventListener('seeked', on); res(); };
      video.addEventListener('seeked', on);
      video.currentTime = Math.min(t, (video.duration || t));
    });
  }

  // Physically re-render only the kept segments into a new WebM (real trim).
  // Video via canvas.captureStream; audio routed through WebAudio to a stream
  // destination (so nothing plays aloud) and recorded together.
  async function renderTrimmed(srcUrl, segs, onProgress) {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = srcUrl; video.playsInline = true; video.muted = false; video.preload = 'auto';
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error('Could not load video')); });
    const w = video.videoWidth || 1280, h = video.videoHeight || 720;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const canvasStream = canvas.captureStream(30);

    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    let audioTracks = [];
    try {
      const srcNode = ac.createMediaElementSource(video);
      const dest = ac.createMediaStreamDestination();
      srcNode.connect(dest); // NOT connected to ac.destination → silent to user
      audioTracks = dest.stream.getAudioTracks();
    } catch { /* no audio — proceed video-only */ }

    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const total = segs.reduce((a, s) => a + (s.end - s.start), 0) || 1;
    let done = 0, raf;
    const draw = () => { try { ctx.drawImage(video, 0, 0, w, h); } catch {} raf = requestAnimationFrame(draw); };

    const blob = await new Promise(async (resolve) => {
      rec.onstop = () => { cancelAnimationFrame(raf); try { ac.close(); } catch {} resolve(new Blob(chunks, { type: 'video/webm' })); };
      rec.start();
      draw();
      for (const sg of segs) {
        await seek(video, sg.start);
        try { await video.play(); } catch {}
        await new Promise((res) => {
          let settled = false;
          const finish = () => { if (settled) return; settled = true; try { video.pause(); } catch {} res(); };
          const check = () => {
            if (settled) return;
            // Resolve when we reach the segment end OR the video naturally ends
            // (at the natural end the element is PAUSED, so this must be checked
            // independently of paused state — that was the 99% stall bug).
            if (video.ended || video.currentTime >= sg.end - 0.04) { finish(); return; }
            onProgress(Math.min(0.99, (done + Math.max(0, video.currentTime - sg.start)) / total));
            requestAnimationFrame(check);
          };
          video.addEventListener('ended', finish, { once: true });
          check();
        });
        done += (sg.end - sg.start);
        onProgress(Math.min(0.99, done / total));
      }
      // give the recorder a tick to flush the last frames, then stop
      await new Promise((r) => setTimeout(r, 120));
      rec.stop();
    });
    return blob;
  }

  async function clientRender() {
    // Fallback path: render in the browser and replace the original.
    setIndeterminate(false); setProgress(0); setExportMsg('Rendering your trimmed video in your browser… keep this tab open.');
    const blob = await renderTrimmed(rec.filename, segments, (p) => setProgress(p));
    setProgress(1); setExportMsg('Uploading trimmed video…');
    const form = new FormData();
    form.append('video', blob, 'trimmed.webm');
    form.append('duration', String(Math.round(keptDuration)));
    const res = await authFetch(`${API}/api/recordings/${id}/replace`, { method: 'POST', body: form });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Upload failed'); }
  }

  async function save() {
    const isFull = segments.length === 1 && segments[0].start <= 0.05 && segments[0].end >= duration - 0.05;
    if (isFull) {
      setSaving(true);
      await authFetch(`${API}/api/recordings/${id}/meta`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segments: null, trimStart: null, trimEnd: null }) });
      setSaving(false); setSaved(true); setTimeout(() => navigate('/'), 900);
      return;
    }
    try { videoRef.current && videoRef.current.pause(); } catch {}
    setExporting(true); setIndeterminate(true); setProgress(0);
    setExportMsg('Trimming your video on our servers…');
    try {
      // Fast path: let the server (Cloudinary) cut + splice the segments.
      const res = await authFetch(`${API}/api/recordings/${id}/trim`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segments }),
      });
      if (res.ok) { setIndeterminate(false); setProgress(1); setExportMsg('Saved ✓ Your video is trimmed.'); setTimeout(() => navigate('/'), 1000); return; }
      // Server can't do it (e.g. local/dev) → render in the browser instead.
      if (res.status === 501) { await clientRender(); setExportMsg('Saved ✓ Your video is trimmed.'); setTimeout(() => navigate('/'), 1000); return; }
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Server trim failed');
    } catch (e) {
      // Last-resort: browser render; if that also fails, save a virtual trim.
      try {
        await clientRender();
        setExportMsg('Saved ✓ Your video is trimmed.'); setTimeout(() => navigate('/'), 1000);
      } catch (e2) {
        setIndeterminate(false);
        setExportMsg('Could not render (' + (e2.message || e.message) + '). Saved as a virtual trim instead.');
        await authFetch(`${API}/api/recordings/${id}/meta`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segments, trimStart: segments[0].start, trimEnd: segments[segments.length - 1].end }) }).catch(() => {});
        setTimeout(() => setExporting(false), 2800);
      }
    }
  }

  if (!rec) return <div className={s.loading}>Loading editor…</div>;
  const pct = (t) => (duration ? (t / duration) * 100 : 0);

  return (
    <div className={s.page}>
      <header className={s.topbar}>
        <Link to="/" className={s.back}><ArrowLeft size={16} /> Back to library</Link>
        <div className={s.title}>{rec.title}</div>
        <div className={s.topActions}>
          <button className={s.ghost} onClick={resetEdits}><RotateCcw size={15} /> Reset</button>
          <button className={s.primary} onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
          </button>
        </div>
      </header>

      <div className={s.stage}>
        <video
          ref={videoRef}
          className={s.video}
          src={rec.filename}
          onLoadedMetadata={onMeta}
          onTimeUpdate={onTimeUpdate}
          onClick={togglePlay}
          playsInline
        />
      </div>

      {/* Transport */}
      <div className={s.transport}>
        <button className={s.tbtn} onClick={() => seekTo(playhead - 5)} title="Back 5s"><SkipBack size={18} /></button>
        <button className={s.playBtn} onClick={togglePlay}>{playing ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}</button>
        <button className={s.tbtn} onClick={() => seekTo(playhead + 5)} title="Forward 5s"><SkipForward size={18} /></button>
        <div className={s.time}>{fmt(playhead)} <span>/ {fmt(duration)}</span></div>
        <div className={s.spacer} />
        <button className={s.tbtn} onClick={splitAtPlayhead} title="Split at playhead"><Scissors size={17} /> Split</button>
      </div>

      {/* Timeline */}
      <div className={s.timelineWrap}>
        <div className={s.track} ref={trackRef} onClick={onTrackClick}>
          {/* cut gaps are the empty track; kept segments are blocks */}
          {segments.map((sg, i) => (
            <div key={i} className={s.segment} style={{ left: `${pct(sg.start)}%`, width: `${pct(sg.end - sg.start)}%` }}>
              <span className={s.handle} onMouseDown={(e) => { e.stopPropagation(); setDrag({ segIndex: i, edge: 'start' }); }} />
              <span className={s.segLabel}>{fmt(sg.end - sg.start)}</span>
              {segments.length > 1 && (
                <button className={s.segDel} onClick={(e) => { e.stopPropagation(); deleteSegment(i); }} title="Delete this part"><Trash2 size={13} /></button>
              )}
              <span className={`${s.handle} ${s.handleEnd}`} onMouseDown={(e) => { e.stopPropagation(); setDrag({ segIndex: i, edge: 'end' }); }} />
            </div>
          ))}
          {/* playhead */}
          <div className={s.playhead} style={{ left: `${pct(playhead)}%` }} />
        </div>
        <div className={s.tlMeta}>
          <span>Drag the handles to trim · Split &amp; delete parts to cut</span>
          <span>Final length: <strong>{fmt(keptDuration)}</strong></span>
        </div>
      </div>

      {exporting && (
        <div className={s.exportOverlay}>
          <div className={s.exportCard}>
            <div className={s.exportTitle}>{exportMsg}</div>
            {indeterminate ? (
              <div className={s.exportBar}><div className={s.exportIndet} /></div>
            ) : (
              <>
                <div className={s.exportBar}><div className={s.exportFill} style={{ width: `${Math.round(progress * 100)}%` }} /></div>
                <div className={s.exportPct}>{Math.round(progress * 100)}%</div>
              </>
            )}
            <div className={s.exportNote}>{indeterminate ? 'Our servers are cutting and stitching your clip — this is usually quick.' : 'Re-rendering in your browser runs about as long as the trimmed video. Please keep this tab focused.'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
