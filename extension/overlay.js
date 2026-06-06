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

  // ── Control toolbar ──────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = '__sr_toolbar';
  bar.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:28px', 'transform:translateX(-50%)',
    `z-index:${Z}`, 'display:flex', 'align-items:center', 'gap:6px',
    'background:#14141f', 'color:#fff', 'padding:8px 10px', 'border-radius:999px',
    'box-shadow:0 10px 34px rgba(0,0,0,.45)', 'font-family:Inter,system-ui,sans-serif',
    'user-select:none',
  ].join(';');

  const dot = document.createElement('span');
  dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#ff4b4b;margin:0 6px 0 8px;box-shadow:0 0 0 0 rgba(255,75,75,.6);animation:__srpulse 1.4s infinite';
  const timer = document.createElement('span');
  timer.id = '__sr_timer';
  timer.textContent = '00:00';
  timer.style.cssText = 'font-variant-numeric:tabular-nums;font-weight:700;font-size:14px;min-width:48px;margin-right:6px';

  function tbtn(label, title, bg) {
    const b = document.createElement('button');
    b.setAttribute('data-no-drag', '1');
    b.title = title;
    b.innerHTML = label;
    b.style.cssText = [
      'border:none', 'cursor:pointer', 'border-radius:999px', 'font-size:13px',
      'font-weight:600', 'padding:8px 14px', 'color:#fff', 'font-family:inherit',
      `background:${bg}`,
    ].join(';');
    return b;
  }

  const pauseBtn = tbtn('❚❚ Pause', 'Pause / resume', 'rgba(255,255,255,.14)');
  const stopBtn = tbtn('■ Stop', 'Stop & save', '#ff4b4b');
  const cancelBtn = tbtn('✕', 'Discard recording', 'rgba(255,255,255,.14)');

  pauseBtn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'SR_PAUSE' }));
  stopBtn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'SR_STOP' }));
  cancelBtn.addEventListener('click', () => { if (confirm('Discard this recording?')) chrome.runtime.sendMessage({ type: 'SR_CANCEL' }); });

  const grip = document.createElement('span');
  grip.textContent = '⠿';
  grip.style.cssText = 'opacity:.5;font-size:16px;padding:0 4px;cursor:grab';

  bar.append(grip, dot, timer, pauseBtn, stopBtn, cancelBtn);

  const style = document.createElement('style');
  style.textContent = '@keyframes __srpulse{0%{box-shadow:0 0 0 0 rgba(255,75,75,.6)}70%{box-shadow:0 0 0 7px rgba(255,75,75,0)}100%{box-shadow:0 0 0 0 rgba(255,75,75,0)}}';
  document.documentElement.appendChild(style);
  (document.body || document.documentElement).appendChild(bar);
  makeDraggable(bar, bar); // drag from anywhere on the bar (buttons opt out via data-no-drag)

  // ── Camera bubble (only when camera bubble mode is on) ───────────────────────
  let bubble = null;
  function makeBubble() {
    if (bubble) return;
    bubble = document.createElement('div');
    bubble.id = '__sr_camera_bubble';
    bubble.style.cssText = [
      'position:fixed', 'left:24px', 'bottom:24px', `z-index:${Z}`,
      'width:150px', 'height:150px', 'border-radius:50%', 'overflow:hidden',
      'box-shadow:0 8px 28px rgba(0,0,0,.45)', 'border:3px solid #7c5cfc', 'background:#000',
    ].join(';');
    const v = document.createElement('video');
    v.autoplay = true; v.muted = true; v.playsInline = true;
    v.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1)';
    const x = document.createElement('div');
    x.setAttribute('data-no-drag', '1');
    x.textContent = '×';
    x.title = 'Hide camera';
    x.style.cssText = 'position:absolute;top:2px;right:12px;color:#fff;font-size:22px;cursor:pointer;text-shadow:0 1px 4px #000;z-index:1';
    x.addEventListener('click', (e) => { e.stopPropagation(); hideBubble(); });
    bubble.append(v, x);
    (document.body || document.documentElement).appendChild(bubble);
    makeDraggable(bubble, bubble);
    navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480 }, audio: false })
      .then((s) => { camStream = s; v.srcObject = s; })
      .catch(() => { v.style.display = 'none'; bubble.style.background = '#14141f';
        bubble.insertAdjacentHTML('beforeend', '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:600 12px Inter,sans-serif;text-align:center;padding:0 12px">Camera blocked on this site</div>'); });
  }
  function hideBubble() {
    try { if (camStream) camStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    camStream = null;
    const el = document.getElementById('__sr_camera_bubble');
    if (el) el.remove();
    bubble = null;
  }

  chrome.storage.local.get('recOptions', (d) => {
    if (d && d.recOptions && d.recOptions.camera === 'bubble') makeBubble();
  });

  // ── Cleanup + incoming messages from the recorder window ─────────────────────
  function cleanupAll() {
    hideBubble();
    if (bar && bar.parentNode) bar.remove();
    window.__srOverlayActive = false;
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'SR_STOP_BUBBLE') cleanupAll();
    if (msg.type === 'SR_OVERLAY_TICK') timer.textContent = msg.text;
    if (msg.type === 'SR_OVERLAY_STATE') {
      pauseBtn.innerHTML = msg.state === 'paused' ? '▶ Resume' : '❚❚ Pause';
      dot.style.animationPlayState = msg.state === 'paused' ? 'paused' : 'running';
      dot.style.background = msg.state === 'paused' ? '#f59e0b' : '#ff4b4b';
    }
  });
})();
