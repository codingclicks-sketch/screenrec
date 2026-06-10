import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Captions, RotateCcw, RotateCw } from 'lucide-react';
import s from './VideoPlayer.module.css';

function clk(t) { if (!isFinite(t)) t = 0; const m = Math.floor(t / 60), x = Math.floor(t % 60); return `${m}:${String(x).padStart(2, '0')}`; }
const SPEEDS = [0.5, 1, 1.25, 1.5, 1.75, 2];

// Custom video player: native <video> with our own controls + reaction/comment
// markers rendered ON the progress bar at their timestamps. Honors virtual
// trims/segments (skips cut gaps) and a recommended playback speed. The parent
// keeps the videoRef so it can seek (comment timestamps) and read currentTime
// (react-at-moment, transcript highlight).
export default function VideoPlayer({
  videoRef, src, poster, segments, trimStart, trimEnd, recommendedSpeed,
  markers = [], captions = [], onMarkerClick, onTime,
}) {
  const wrapRef = useRef(null), barRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(recommendedSpeed || 1);
  const [fs, setFs] = useState(false);
  const [cc, setCc] = useState(false);
  const [spdOpen, setSpdOpen] = useState(false);
  const [hoverT, setHoverT] = useState(null);

  const segs = Array.isArray(segments) && segments.length ? segments : null;

  function togglePlay() {
    const v = videoRef.current; if (!v) return;
    if (v.paused) {
      if (segs && !segs.some(g => v.currentTime >= g.start && v.currentTime < g.end)) v.currentTime = segs[0].start;
      v.play();
    } else v.pause();
  }
  function skip(d) { const v = videoRef.current; if (v) v.currentTime = Math.max(0, Math.min(dur || v.duration || 0, v.currentTime + d)); }

  function onMeta(e) {
    const v = e.target;
    if (recommendedSpeed) { try { v.playbackRate = recommendedSpeed; setSpeed(recommendedSpeed); } catch {} }
    const start = segs ? segs[0].start : (Number(trimStart) || 0);
    if (v.duration === Infinity || isNaN(v.duration)) {
      v.currentTime = 1e101;
      v.ontimeupdate = () => { v.ontimeupdate = null; v.currentTime = start; if (isFinite(v.duration)) setDur(v.duration); };
    } else { if (start) v.currentTime = start; setDur(v.duration); }
  }
  function onTU(e) {
    const v = e.target; setCur(v.currentTime); onTime && onTime(v.currentTime);
    if (segs) {
      const t = v.currentTime;
      const inSeg = segs.find(g => t >= g.start - 0.05 && t < g.end);
      if (!inSeg) { const next = segs.find(g => g.start > t); if (next) v.currentTime = next.start; else { v.pause(); v.currentTime = segs[0].start; } }
      return;
    }
    const start = Number(trimStart) || 0;
    if (trimEnd != null && v.currentTime >= trimEnd) { v.pause(); v.currentTime = start; }
  }
  function seekEv(e) {
    const r = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (videoRef.current && (dur || videoRef.current.duration)) videoRef.current.currentTime = ratio * (dur || videoRef.current.duration);
  }
  function setVolume(x) { const v = videoRef.current; if (v) { v.volume = x; v.muted = x === 0; } setVol(x); setMuted(x === 0); }
  function toggleMute() { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }
  function setSpd(x) { const v = videoRef.current; if (v) v.playbackRate = x; setSpeed(x); setSpdOpen(false); }
  function toggleFs() { const el = wrapRef.current; if (!document.fullscreenElement) el?.requestFullscreen?.(); else document.exitFullscreen?.(); }
  useEffect(() => { const h = () => setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); }, []);

  const pct = t => (dur ? Math.min(100, (t / dur) * 100) : 0);
  const curCap = cc && captions.length ? (captions.find(c => cur >= c.start && cur < c.end)?.text || '') : '';

  return (
    <div className={`${s.wrap} ${fs ? s.fs : ''}`} ref={wrapRef}>
      <video ref={videoRef} src={src} poster={poster} className={s.video} playsInline autoPlay
        onClick={togglePlay} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onLoadedMetadata={onMeta} onTimeUpdate={onTU} />

      {curCap && <div className={s.caption}>{curCap}</div>}
      {!playing && <button className={s.bigPlay} onClick={togglePlay} aria-label="Play"><Play size={28} fill="currentColor" /></button>}

      <div className={s.controls}>
        <div className={s.bar} ref={barRef} onClick={seekEv}
          onMouseMove={e => { const r = barRef.current.getBoundingClientRect(); setHoverT(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur); }}
          onMouseLeave={() => setHoverT(null)}>
          <div className={s.barBg} />
          <div className={s.barFill} style={{ width: `${pct(cur)}%` }} />
          {hoverT != null && <div className={s.barHover} style={{ left: `${pct(hoverT)}%` }} />}
          {markers.map((m, i) => (
            <button key={i} className={`${s.marker} ${m.kind === 'comment' ? s.mComment : ''}`} style={{ left: `${pct(m.t)}%` }}
              title={m.label} onClick={e => { e.stopPropagation(); onMarkerClick && onMarkerClick(m.t); }}>
              {m.kind === 'comment' ? '💬' : m.emoji}
            </button>
          ))}
        </div>

        <div className={s.btns}>
          <button className={s.cBtn} onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button>
          <button className={s.cBtn} onClick={() => skip(-5)} title="Back 5s"><RotateCcw size={17} /></button>
          <button className={s.cBtn} onClick={() => skip(5)} title="Forward 5s"><RotateCw size={17} /></button>
          <div className={s.vol}>
            <button className={s.cBtn} onClick={toggleMute} title="Mute">{muted || vol === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <input className={s.volSlider} type="range" min="0" max="1" step="0.05" value={muted ? 0 : vol} onChange={e => setVolume(Number(e.target.value))} />
          </div>
          <span className={s.time}>{clk(cur)} / {clk(dur)}</span>
          <div className={s.spacer} />
          {captions.length > 0 && <button className={`${s.cBtn} ${cc ? s.on : ''}`} onClick={() => setCc(c => !c)} title="Captions"><Captions size={18} /></button>}
          <div className={s.spdWrap}>
            <button className={s.cBtn} onClick={() => setSpdOpen(o => !o)} title="Playback speed"><span className={s.spdLabel}>{speed}×</span></button>
            {spdOpen && <div className={s.spdMenu}>{SPEEDS.map(x => <button key={x} className={`${s.spdItem} ${x === speed ? s.on : ''}`} onClick={() => setSpd(x)}>{x}×</button>)}</div>}
          </div>
          <button className={s.cBtn} onClick={toggleFs} title="Fullscreen">{fs ? <Minimize size={18} /> : <Maximize size={18} />}</button>
        </div>
      </div>
    </div>
  );
}
