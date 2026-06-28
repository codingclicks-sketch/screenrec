// Screenshot capture page — grabs one frame via getDisplayMedia (screen / window
// / tab), shows a preview, and lets the user copy or download it. The image never
// leaves the device.

const canvas   = document.getElementById('shot');
const empty    = document.getElementById('empty');
const actions  = document.getElementById('actions');
const statusEl = document.getElementById('status');
const hint     = document.getElementById('hint');
const DEFAULT_HINT = hint.textContent;

function setStatus(msg, cls = '') { statusEl.textContent = msg; statusEl.className = 'status ' + cls; }

document.getElementById('closeBtn').addEventListener('click', () => { try { window.close(); } catch (e) {} });

function showCaptureButton() {
  actions.innerHTML = '<button class="btn btn-primary" id="captureBtn">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
    + ' Capture screenshot</button>';
  document.getElementById('captureBtn').addEventListener('click', capture);
}

function showResultButtons() {
  hint.textContent = 'Copy it straight into a doc or chat, or download the PNG.';
  actions.innerHTML =
      '<button class="btn btn-primary" id="copyBtn">📋 Copy to clipboard</button>'
    + '<button class="btn btn-ghost" id="dlBtn">⤓ Download PNG</button>'
    + '<button class="btn btn-ghost" id="retakeBtn">↺ Retake</button>';
  document.getElementById('copyBtn').addEventListener('click', copyShot);
  document.getElementById('dlBtn').addEventListener('click', downloadShot);
  document.getElementById('retakeBtn').addEventListener('click', () => {
    canvas.style.display = 'none'; empty.style.display = 'flex';
    hint.textContent = DEFAULT_HINT; setStatus(''); showCaptureButton();
  });
}

async function capture() {
  setStatus('Choose what to share…');
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
      audio: false,
    });
  } catch (e) {
    setStatus(e && e.name === 'NotAllowedError' ? 'Capture cancelled.' : ('Could not capture: ' + (e?.message || e)),
      e && e.name === 'NotAllowedError' ? '' : 'err');
    return;
  }
  try {
    const video = document.createElement('video');
    video.srcObject = stream; video.muted = true; video.playsInline = true;
    await video.play();
    if (!video.videoWidth) await new Promise(r => video.addEventListener('loadedmetadata', r, { once: true }));
    // Wait for a painted frame before grabbing it.
    await new Promise(r => video.requestVideoFrameCallback
      ? video.requestVideoFrameCallback(() => r())
      : setTimeout(r, 180));
    const w = video.videoWidth || 1920, h = video.videoHeight || 1080;
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    canvas.style.display = 'block';
    empty.style.display = 'none';
    showResultButtons();
    setStatus(`Captured ${w}×${h}.`, 'ok');
  } catch (e) {
    setStatus('Could not grab the frame — please try again.', 'err');
  } finally {
    try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  }
}

function copyShot() {
  if (!canvas.width) return;
  canvas.toBlob(async (blob) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setStatus('Copied to clipboard ✓', 'ok');
    } catch (e) {
      setStatus('Copy isn’t available here — use Download instead.', 'err');
    }
  }, 'image/png');
}

function stamp() {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function downloadShot() {
  if (!canvas.width) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `veorec-screenshot-${stamp()}.png`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { try { a.remove(); } catch (e) {} }, 1000);
  setStatus('Downloaded ✓', 'ok');
}

// Wire the capture button already in the page (a click is a clean user gesture
// for getDisplayMedia — auto-calling on load can be blocked as gesture-less).
document.getElementById('captureBtn').addEventListener('click', capture);
