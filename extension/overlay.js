// ─────────────────────────────────────────────────────────────────────────────
// ON-SCREEN RECORDING OVERLAY (content script injected into the recorded tab)
//
// Renders two floating, draggable elements that appear INSIDE the captured page
// so they show up in the recording and can be repositioned by the user:
//   1. A control toolbar (timer + Pause/Resume, Stop, Cancel)
//   2. A circular camera bubble (webcam preview)
//
// It is a thin UI shell — the actual MediaRecorder runs in the recorder window.
// Communication:
//   overlay → recorder : chrome.runtime.sendMessage({type:'SR_PAUSE'|'SR_STOP'|'SR_CANCEL'})
//   recorder → overlay : chrome.tabs.sendMessage(tabId, {type:'SR_OVERLAY_TICK'|'SR_OVERLAY_STATE'|'SR_STOP_BUBBLE'})
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  if (window.__srOverlayActive) return;
  window.__srOverlayActive = true;

  const Z = '2147483647';
  let camStream = null;

  // Make an element draggable by a given handle (defaults to the element itself).
  function makeDraggable(el, handle) {
    handle = handle || el;
    handle.style.cursor = 'grab';
    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-no-drag]')) return;
      dragging = true;
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      el.style.right = 'auto'; el.style.bottom = 'auto';
      handle.style.cursor = 'grabbing';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const x = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, e.clientX - ox));
      const y = Math.max(4, Math.min(window.innerHeight - el.offsetHeight - 4, e.clientY - oy));
      el.style.left = x + 'px'; el.style.top = y + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; handle.style.cursor = 'grab'; });
  }

  // Icons (inline SVG, stroke = currentColor)
  const SVG = {
    pause: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    restart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
  };

  // ── Control toolbar (vertical) ───────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = '__sr_toolbar';
  bar.style.cssText = [
    'position:fixed', 'left:24px', 'top:24px', `z-index:${Z}`,
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:8px',
    'background:#16161f', 'color:#fff', 'padding:12px 10px', 'border-radius:20px',
    'box-shadow:0 12px 40px rgba(0,0,0,.5)', 'font-family:Inter,system-ui,sans-serif',
    'user-select:none', 'width:64px',
  ].join(';');

  // Big red Stop button on top
  const stopBtn = document.createElement('button');
  stopBtn.setAttribute('data-no-drag', '1');
  stopBtn.innerHTML = '<span style="width:16px;height:16px;background:#fff;border-radius:4px;display:block"></span>';
  stopBtn.style.cssText = 'border:none;cursor:pointer;width:46px;height:46px;border-radius:14px;background:#ff5436;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(255,84,54,.5)';

  const timer = document.createElement('div');
  timer.id = '__sr_timer';
  timer.textContent = '0:00';
  timer.style.cssText = 'font-variant-numeric:tabular-nums;font-weight:800;font-size:15px;letter-spacing:.5px';

  const sep = document.createElement('div');
  sep.style.cssText = 'width:34px;height:1px;background:rgba(255,255,255,.12);margin:2px 0';

  // A round icon button with a hover tooltip showing its keyboard shortcut.
  function iconBtn(svg, label, keys, onClick) {
    const b = document.createElement('button');
    b.setAttribute('data-no-drag', '1');
    b.innerHTML = svg;
    b.style.cssText = 'position:relative;border:none;cursor:pointer;width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.10);color:#fff;display:flex;align-items:center;justify-content:center;transition:background .15s';
    b.addEventListener('mouseenter', () => { b.style.background = 'rgba(255,255,255,.20)'; tip.style.display = 'flex'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'rgba(255,255,255,.10)'; tip.style.display = 'none'; });
    b.addEventListener('click', onClick);
    // tooltip (to the right of the bar)
    const tip = document.createElement('div');
    tip.style.cssText = 'display:none;position:absolute;left:calc(100% + 14px);top:50%;transform:translateY(-50%);align-items:center;gap:6px;background:#16161f;color:#fff;padding:7px 10px;border-radius:10px;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:12.5px;font-weight:600';
    let inner = `<span>${label}</span>`;
    for (const k of keys) inner += `<span style="background:rgba(255,255,255,.16);border-radius:5px;padding:2px 6px;font-size:11px">${k}</span>`;
    tip.innerHTML = inner;
    b.appendChild(tip);
    return b;
  }

  // Stop tooltip
  const stopWrap = document.createElement('div');
  stopWrap.style.cssText = 'position:relative;display:flex';
  stopBtn.addEventListener('mouseenter', () => { stopTip.style.display = 'flex'; });
  stopBtn.addEventListener('mouseleave', () => { stopTip.style.display = 'none'; });
  const stopTip = document.createElement('div');
  stopTip.style.cssText = 'display:none;position:absolute;left:calc(100% + 14px);top:50%;transform:translateY(-50%);align-items:center;gap:6px;background:#16161f;color:#fff;padding:7px 10px;border-radius:10px;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:12.5px;font-weight:600';
  stopTip.innerHTML = '<span>Stop &amp; save</span><span style="background:rgba(255,255,255,.16);border-radius:5px;padding:2px 6px;font-size:11px">Alt</span><span style="background:rgba(255,255,255,.16);border-radius:5px;padding:2px 6px;font-size:11px">Shift</span><span style="background:rgba(255,255,255,.16);border-radius:5px;padding:2px 6px;font-size:11px">X</span>';
  stopBtn.appendChild(stopTip);
  stopBtn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'SR_STOP' }));

  const pauseBtn = iconBtn(SVG.pause, 'Pause', ['Alt', 'Shift', 'S'], () => chrome.runtime.sendMessage({ type: 'SR_PAUSE' }));
  const restartBtn = iconBtn(SVG.restart, 'Restart', ['Alt', 'Shift', 'R'], () => { if (confirm('Discard this take and start over?')) chrome.runtime.sendMessage({ type: 'SR_RESTART' }); });
  const deleteBtn = iconBtn(SVG.trash, 'Delete', ['Alt', 'Shift', 'D'], () => { if (confirm('Discard this recording?')) chrome.runtime.sendMessage({ type: 'SR_CANCEL' }); });

  bar.append(stopBtn, timer, sep, pauseBtn, restartBtn, deleteBtn);

  const style = document.createElement('style');
  style.textContent = '@keyframes __srpulse{0%{box-shadow:0 0 0 0 rgba(255,75,75,.6)}70%{box-shadow:0 0 0 7px rgba(255,75,75,0)}100%{box-shadow:0 0 0 0 rgba(255,75,75,0)}}';
  document.documentElement.appendChild(style);
  (document.body || document.documentElement).appendChild(bar);
  makeDraggable(bar, bar); // drag from anywhere on the bar (buttons opt out via data-no-drag)

  // ── Keyboard shortcuts (Alt+Shift+…) ─────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 'x') { e.preventDefault(); chrome.runtime.sendMessage({ type: 'SR_STOP' }); }
    else if (k === 's') { e.preventDefault(); chrome.runtime.sendMessage({ type: 'SR_PAUSE' }); }
    else if (k === 'r') { e.preventDefault(); chrome.runtime.sendMessage({ type: 'SR_RESTART' }); }
    else if (k === 'd') { e.preventDefault(); chrome.runtime.sendMessage({ type: 'SR_CANCEL' }); }
  }, true);

  // ── Camera bubble (only when camera bubble mode is on) ───────────────────────
  let bubble = null, bubbleVideo = null, cameraEnabled = false, bubbleSize = 150;
  const BUBBLE_SIZES = { sm: 110, md: 150, lg: 200 };
  function makeBubble() {
    if (bubble) return;
    bubble = document.createElement('div');
    bubble.id = '__sr_camera_bubble';
    bubble.style.cssText = [
      'position:fixed', 'left:24px', 'bottom:24px', `z-index:${Z}`,
      `width:${bubbleSize}px`, `height:${bubbleSize}px`, 'border-radius:50%', 'overflow:hidden',
      'box-shadow:0 8px 28px rgba(0,0,0,.45)', 'border:3px solid #7c5cfc', 'background:#000',
    ].join(';');
    bubbleVideo = document.createElement('video');
    bubbleVideo.autoplay = true; bubbleVideo.muted = true; bubbleVideo.playsInline = true;
    bubbleVideo.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1)';
    const x = document.createElement('div');
    x.setAttribute('data-no-drag', '1');
    x.textContent = '×';
    x.title = 'Hide camera';
    x.style.cssText = 'position:absolute;top:2px;right:12px;color:#fff;font-size:22px;cursor:pointer;text-shadow:0 1px 4px #000;z-index:1';
    x.addEventListener('click', (e) => { e.stopPropagation(); hideBubble(); });
    bubble.append(bubbleVideo, x);
    (document.body || document.documentElement).appendChild(bubble);
    makeDraggable(bubble, bubble);
    if (!document.hidden) startCam();
  }
  function startCam() {
    if (!bubble || camStream) return;
    navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480 }, audio: false })
      .then((s) => { camStream = s; if (bubbleVideo) bubbleVideo.srcObject = s; })
      .catch(() => { if (bubbleVideo) bubbleVideo.style.display = 'none'; if (bubble) { bubble.style.background = '#14141f';
        bubble.insertAdjacentHTML('beforeend', '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:600 12px Inter,sans-serif;text-align:center;padding:0 12px">Camera blocked on this site</div>'); } });
  }
  function stopCam() {
    try { if (camStream) camStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    camStream = null;
  }
  function hideBubble() {
    stopCam();
    const el = document.getElementById('__sr_camera_bubble');
    if (el) el.remove();
    bubble = null; bubbleVideo = null; cameraEnabled = false;
  }

  // Only the visible tab holds the webcam — release it when this tab is hidden so
  // the tab you switch TO can acquire the camera, then re-acquire when visible.
  document.addEventListener('visibilitychange', () => {
    if (!cameraEnabled || !bubble) return;
    if (document.hidden) stopCam(); else startCam();
  });

  chrome.storage.local.get('recOptions', (d) => {
    const o = d && d.recOptions;
    if (o && o.camera === 'bubble') {
      bubbleSize = BUBBLE_SIZES[o.bubbleSize] || BUBBLE_SIZES.md;
      cameraEnabled = true;
      makeBubble();
    }
  });

  // ── Self-syncing state (works across tab switches) ───────────────────────────
  // Every tab's overlay reads the shared recState from storage and ticks its own
  // timer + paused UI, and removes itself when recording ends. This is what makes
  // the toolbar/bubble "follow" you when you switch tabs.
  function setPausedUI(paused) {
    const icon = pauseBtn.querySelector('svg');
    if (icon) icon.outerHTML = paused ? SVG.play : SVG.pause;
    timer.style.color = paused ? '#f59e0b' : '#fff';
  }
  function cleanupAll() {
    hideBubble();
    if (bar && bar.parentNode) bar.remove();
    window.__srOverlayActive = false;
    clearInterval(tickIv);
  }
  function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  let started = false; // becomes true once recording actually begins
  const tickIv = setInterval(() => {
    chrome.storage.local.get('recState', (d) => {
      const st = d.recState || {};
      if (st.recording) {
        started = true;
        const now = Date.now();
        const pausedExtra = st.paused && st.pauseStartedAt ? now - st.pauseStartedAt : 0;
        const s = Math.max(0, Math.floor((now - st.startTime - (st.pausedAccum || 0) - pausedExtra) / 1000));
        timer.textContent = fmt(s);
        setPausedUI(!!st.paused);
      } else if (started) {
        // Recording ended → remove the overlay on every tab.
        cleanupAll();
      }
      // else: countdown / pre-start — keep the overlay visible showing 0:00
    });
  }, 500);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'SR_STOP_BUBBLE') cleanupAll();
  });
})();
