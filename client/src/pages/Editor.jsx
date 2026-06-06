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

  async function save() {
    setSaving(true);
    // If a single full-length segment, store as no edit; else store segments.
    const isFull = segments.length === 1 && segments[0].start <= 0.05 && segments[0].end >= duration - 0.05;
    const body = isFull
      ? { segments: null, trimStart: null, trimEnd: null }
      : { segments, trimStart: segments[0].start, trimEnd: segments[segments.length - 1].end };
    const res = await authFetch(`${API}/api/recordings/${id}/meta`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => navigate('/'), 900); }
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
    </div>
  );
}
