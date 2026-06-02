// Floating, draggable, closable camera bubble — injected into the page being
// recorded. Because it's a real DOM element on the captured tab, it appears in
// the recording natively (no canvas), so screen capture never freezes when the
// recorder window is minimized.
(function () {
  if (window.__srBubbleActive) return;
  window.__srBubbleActive = true;

  const wrap = document.createElement('div');
  wrap.id = '__sr_camera_bubble';
  wrap.style.cssText = [
    'position:fixed', 'bottom:24px', 'left:24px', 'z-index:2147483647',
    'width:160px', 'height:160px', 'border-radius:50%', 'overflow:hidden',
    'box-shadow:0 8px 28px rgba(0,0,0,.45)', 'border:3px solid #7c5cfc',
    'cursor:grab', 'background:#000',
  ].join(';');

  const video = document.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true;
  video.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1);';

  const close = document.createElement('div');
  close.textContent = '×';
  close.title = 'Hide camera';
  close.style.cssText = [
    'position:absolute', 'top:0', 'right:10px', 'color:#fff', 'font-size:24px',
    'font-family:sans-serif', 'cursor:pointer', 'text-shadow:0 1px 4px #000',
    'z-index:1', 'line-height:1.2',
  ].join(';');
  close.addEventListener('click', (e) => { e.stopPropagation(); cleanup(); });

  wrap.appendChild(video);
  wrap.appendChild(close);
  (document.body || document.documentElement).appendChild(wrap);

  let stream = null;
  navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480 }, audio: false })
    .then((s) => { stream = s; video.srcObject = s; })
    .catch(() => { /* camera denied/unavailable — leave bubble empty */ });

  // Drag to reposition
  let dragging = false, ox = 0, oy = 0;
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === close) return;
    dragging = true;
    const rect = wrap.getBoundingClientRect();
    ox = e.clientX - rect.left; oy = e.clientY - rect.top;
    wrap.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    wrap.style.left = (e.clientX - ox) + 'px';
    wrap.style.top = (e.clientY - oy) + 'px';
    wrap.style.bottom = 'auto';
  });
  window.addEventListener('mouseup', () => { dragging = false; wrap.style.cursor = 'grab'; });

  function cleanup() {
    try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    const el = document.getElementById('__sr_camera_bubble');
    if (el) el.remove();
    window.__srBubbleActive = false;
  }

  // The recorder tells us to disappear when recording stops.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'SR_STOP_BUBBLE') cleanup();
  });
})();
