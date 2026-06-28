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

  // Annotation tools — drawing pen + click highlighter (both are DOM overlays, so
  // they appear in the recording on the captured tab).
  const SVG_PEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
  const SVG_CLICK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
  const sep2 = document.createElement('div');
  sep2.style.cssText = 'width:34px;height:1px;background:rgba(255,255,255,.12);margin:2px 0';
  const drawBtn = iconBtn(SVG_PEN, 'Draw', ['Alt', 'Shift', 'P'], () => toggleDraw());
  const clickBtn = iconBtn(SVG_CLICK, 'Highlight clicks', ['Alt', 'Shift', 'C'], () => toggleClicks());

  bar.append(stopBtn, timer, sep, pauseBtn, restartBtn, deleteBtn, sep2, drawBtn, clickBtn);

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
    else if (k === 'p') { e.preventDefault(); toggleDraw(); }
    else if (k === 'c') { e.preventDefault(); toggleClicks(); }
  }, true);

  // ── Drawing / annotation + click highlights ──────────────────────────────────
  // Both render INTO the page so the screen capture records them. Drawing puts a
  // full-page canvas on top (you draw, then "Done" to interact again); click
  // highlight spawns a ripple at each click. They only show on this captured tab.
  let drawCanvas = null, drawCtx = null, drawing = false, penDown = false, penColor = '#ff3b3b', palette = null;
  let clicksOn = false, clickHandler = null;

  function ensureClickCSS() {
    if (document.getElementById('__sr_click_css')) return;
    const s = document.createElement('style');
    s.id = '__sr_click_css';
    s.textContent = '@keyframes __srclick{0%{transform:translate(-50%,-50%) scale(.35);opacity:.85}100%{transform:translate(-50%,-50%) scale(1.1);opacity:0}}';
    document.documentElement.appendChild(s);
  }

  function startDraw() {
    if (drawCanvas) return;
    drawCanvas = document.createElement('canvas');
    drawCanvas.id = '__sr_draw';
    drawCanvas.style.cssText = `position:fixed;inset:0;z-index:${Number(Z) - 1};cursor:crosshair;touch-action:none`;
    (document.body || document.documentElement).appendChild(drawCanvas);
    const dpr = window.devicePixelRatio || 1;
    function size() {
      // Snapshot existing strokes so a resize doesn't wipe them (reassigning a
      // canvas's width/height clears its bitmap).
      let prev = null;
      const oldW = parseInt(drawCanvas.style.width, 10) || 0, oldH = parseInt(drawCanvas.style.height, 10) || 0;
      if (drawCtx && drawCanvas.width && oldW && oldH) {
        try { prev = document.createElement('canvas'); prev.width = drawCanvas.width; prev.height = drawCanvas.height; prev.getContext('2d').drawImage(drawCanvas, 0, 0); }
        catch (e) { prev = null; }
      }
      drawCanvas.width = Math.floor(window.innerWidth * dpr);
      drawCanvas.height = Math.floor(window.innerHeight * dpr);
      drawCanvas.style.width = window.innerWidth + 'px';
      drawCanvas.style.height = window.innerHeight + 'px';
      drawCtx = drawCanvas.getContext('2d');
      drawCtx.scale(dpr, dpr);
      drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
      if (prev) { try { drawCtx.drawImage(prev, 0, 0, oldW, oldH); } catch (e) {} }
    }
    size();
    drawCanvas.__resize = size;
    window.addEventListener('resize', size);
    let lastX = 0, lastY = 0;
    drawCanvas.addEventListener('pointerdown', (e) => { penDown = true; lastX = e.clientX; lastY = e.clientY; });
    drawCanvas.addEventListener('pointermove', (e) => {
      if (!penDown || !drawCtx) return;
      drawCtx.strokeStyle = penColor; drawCtx.lineWidth = 4;
      drawCtx.beginPath(); drawCtx.moveTo(lastX, lastY); drawCtx.lineTo(e.clientX, e.clientY); drawCtx.stroke();
      lastX = e.clientX; lastY = e.clientY;
    });
    drawCanvas.__up = () => { penDown = false; };
    window.addEventListener('pointerup', drawCanvas.__up);
    makePalette();
  }
  function clearDraw() { if (drawCtx) drawCtx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
  function stopDraw() {
    drawing = false;
    if (drawCanvas) {
      if (drawCanvas.__resize) window.removeEventListener('resize', drawCanvas.__resize);
      if (drawCanvas.__up) window.removeEventListener('pointerup', drawCanvas.__up);
      drawCanvas.remove();
    }
    if (palette) palette.remove();
    drawCanvas = drawCtx = palette = null;
    drawBtn.style.background = 'rgba(255,255,255,.10)';
  }
  function toggleDraw() {
    drawing = !drawing;
    if (drawing) { startDraw(); drawBtn.style.background = penColor; }
    else stopDraw();
  }
  function makePalette() {
    palette = document.createElement('div');
    palette.setAttribute('data-no-drag', '1');
    palette.style.cssText = `position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:${Z};display:flex;align-items:center;gap:7px;background:#16161f;padding:8px 12px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.45);font-family:Inter,system-ui,sans-serif`;
    ['#ff3b3b', '#ffd400', '#22c55e', '#3b82f6', '#ffffff', '#10101c'].forEach((c) => {
      const sw = document.createElement('button');
      sw.__c = c;
      sw.style.cssText = `width:22px;height:22px;border-radius:50%;border:2px solid ${c === penColor ? '#fff' : 'transparent'};background:${c};cursor:pointer;padding:0`;
      sw.addEventListener('click', () => {
        penColor = c; drawBtn.style.background = c;
        palette.querySelectorAll('button').forEach((b) => { if (b.__c) b.style.borderColor = (b.__c === penColor ? '#fff' : 'transparent'); });
      });
      palette.appendChild(sw);
    });
    const clearB = document.createElement('button');
    clearB.textContent = 'Clear';
    clearB.style.cssText = 'border:none;background:rgba(255,255,255,.12);color:#fff;font:600 12px Inter,sans-serif;padding:5px 10px;border-radius:8px;cursor:pointer';
    clearB.addEventListener('click', clearDraw);
    const doneB = document.createElement('button');
    doneB.textContent = 'Done';
    doneB.style.cssText = 'border:none;background:#5b5bf6;color:#fff;font:600 12px Inter,sans-serif;padding:5px 10px;border-radius:8px;cursor:pointer';
    doneB.addEventListener('click', () => toggleDraw());
    palette.append(clearB, doneB);
    (document.body || document.documentElement).appendChild(palette);
  }

  function toggleClicks() {
    clicksOn = !clicksOn;
    clickBtn.style.background = clicksOn ? '#5b5bf6' : 'rgba(255,255,255,.10)';
    if (clicksOn) {
      ensureClickCSS();
      clickHandler = (e) => {
        if (e.target && e.target.closest && e.target.closest('#__sr_toolbar,#__sr_draw,#__sr_camera_bubble,#__sr_bubble_bar,[data-no-drag]')) return;
        const ripple = document.createElement('div');
        ripple.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:54px;height:54px;border-radius:50%;background:rgba(91,91,246,.40);border:2px solid #5b5bf6;pointer-events:none;z-index:${Z};animation:__srclick .55s ease-out forwards`;
        (document.body || document.documentElement).appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      };
      window.addEventListener('click', clickHandler, true);
    } else if (clickHandler) {
      window.removeEventListener('click', clickHandler, true);
      clickHandler = null;
    }
  }

  // ── Camera bubble (only when camera bubble mode is on) ───────────────────────
  let bubble = null, bubbleFrame = null, cameraEnabled = false, bubbleSize = 150;
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
    // The webcam renders inside an EXTENSION-origin iframe (bubble.html), NOT the
    // host page — so camera permission is granted ONCE for the extension and never
    // re-prompts when you switch sites. It's still captured in the recording (it's
    // composited page DOM). The iframe self-manages the device by its own visibility.
    bubbleFrame = document.createElement('iframe');
    bubbleFrame.src = chrome.runtime.getURL('bubble.html');
    bubbleFrame.allow = 'camera; microphone';
    bubbleFrame.style.cssText = 'width:100%;height:100%;border:0;border-radius:50%;background:#000;display:block';
    bubble.append(bubbleFrame);
    (document.body || document.documentElement).appendChild(bubble);
    makeDraggable(bubble, bubble);

    // Live control bar under the bubble: close + size (S / M / L), like Loom.
    const bar = document.createElement('div');
    bar.id = '__sr_bubble_bar';
    bar.setAttribute('data-no-drag', '1');
    bar.style.cssText = [
      'position:fixed', `z-index:${Z}`, 'display:flex', 'align-items:center', 'gap:4px',
      'background:#16161f', 'border-radius:999px', 'padding:5px 7px',
      'box-shadow:0 6px 20px rgba(0,0,0,.4)',
    ].join(';');
    function barBtn(html, title, onClick) {
      const b = document.createElement('button');
      b.setAttribute('data-no-drag', '1');
      b.title = title; b.innerHTML = html;
      b.style.cssText = 'border:none;background:transparent;color:#fff;cursor:pointer;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:inherit';
      b.addEventListener('mouseenter', () => b.style.background = 'rgba(255,255,255,.16)');
      b.addEventListener('mouseleave', () => b.style.background = 'transparent');
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return b;
    }
    const sizeDot = (px) => `<span style="display:block;width:${px}px;height:${px}px;border-radius:50%;background:currentColor"></span>`;
    bar.append(
      barBtn('✕', 'Hide camera', hideBubble),
      barBtn(sizeDot(8), 'Small', () => setBubbleSize('sm')),
      barBtn(sizeDot(12), 'Medium', () => setBubbleSize('md')),
      barBtn(sizeDot(16), 'Large', () => setBubbleSize('lg')),
    );
    (document.body || document.documentElement).appendChild(bar);
    bubble.__bar = bar;
    positionBar();
    // keep the bar glued under the bubble while it's dragged
    bubble.addEventListener('__srmoved', positionBar);
    window.addEventListener('mousemove', () => { if (bubble) positionBar(); });
  }
  function positionBar() {
    if (!bubble || !bubble.__bar) return;
    const r = bubble.getBoundingClientRect();
    bubble.__bar.style.left = (r.left + r.width / 2 - 64) + 'px';
    bubble.__bar.style.top = (r.bottom + 8) + 'px';
  }
  function setBubbleSize(key) {
    if (!bubble) return;
    bubbleSize = BUBBLE_SIZES[key] || BUBBLE_SIZES.md;
    bubble.style.width = bubbleSize + 'px';
    bubble.style.height = bubbleSize + 'px';
    positionBar();
  }
  // The camera lives inside bubble.html (extension origin) and self-manages its
  // device by its own visibility — so the host page never calls getUserMedia and
  // never re-prompts. hideBubble just removes the iframe (which releases the camera).
  function hideBubble() {
    const el = document.getElementById('__sr_camera_bubble');
    if (el) el.remove();
    const bar = document.getElementById('__sr_bubble_bar');
    if (bar) bar.remove();
    bubble = null; bubbleFrame = null; cameraEnabled = false;
  }

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
    try { stopDraw(); } catch (e) {}
    if (clickHandler) { window.removeEventListener('click', clickHandler, true); clickHandler = null; }
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
