// Camera bubble — runs in the EXTENSION origin (loaded as an iframe by overlay.js).
// Because getUserMedia here is keyed to chrome-extension://<id> (a fixed origin),
// the camera permission is granted ONCE and is reused on every host site with no
// re-prompt. The bubble self-manages the device by its OWN visibility (which mirrors
// the host tab's visibility), so exactly one tab — the visible one — holds the camera
// at a time, and switching tabs never re-asks for permission.

let stream = null;
const vid = () => document.getElementById('v');

function showError() {
  if (document.getElementById('__err')) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div id="__err" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'color:#fff;font:600 12px system-ui,sans-serif;text-align:center;padding:0 12px">Camera unavailable</div>');
}

async function start() {
  if (stream || document.hidden) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480 }, audio: false });
    const el = vid(); if (el) el.srcObject = stream;
    const err = document.getElementById('__err'); if (err) err.remove();
  } catch (e) { showError(); }
}

function stop() {
  try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  stream = null;
  const el = vid(); if (el) el.srcObject = null;
}

// Release the camera while this tab is in the background so the tab you switch TO
// can acquire it; re-acquire (silently — permission already granted) when visible.
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });

// Optional commands from the host overlay (mirror toggle); start/stop is automatic.
window.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'SR_BUBBLE_MIRROR') { const el = vid(); if (el) el.style.transform = m.on ? 'scaleX(-1)' : 'none'; }
});

if (!document.hidden) start();
