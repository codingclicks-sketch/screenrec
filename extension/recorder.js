const SERVER = 'https://screenrec-api-production.up.railway.app';

const mainBtn = document.getElementById('mainBtn');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const linkBox = document.getElementById('linkBox');
const linkUrl = document.getElementById('linkUrl');
const copyBtn = document.getElementById('copyBtn');
const openBtn = document.getElementById('openBtn');

let mediaRecorder = null;
let chunks = [];
let startTime = null;
let timerInterval = null;
let elapsed = 0;

// Options chosen in the popup, carried over via storage.
let opts = { quality: 'medium', audio: true };

function setStatus(msg, cls = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + cls;
}

function updateTimer() {
  elapsed++;
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}

// ── The actual recording start. Must run within a user gesture OR be retried
// from the fallback button if the browser rejects the auto-start. ──────────────
async function beginRecording() {
  mainBtn.style.display = 'none';
  linkBox.classList.remove('show');
  setStatus('Select a screen or window to share…');

  const quality = opts.quality || 'medium';
  const wantMic = opts.audio !== false;

  const videoConstraints = {
    width:  { ideal: quality === 'high' ? 1920 : quality === 'medium' ? 1280 : 854 },
    height: { ideal: quality === 'high' ? 1080 : quality === 'medium' ? 720 : 480 },
    frameRate: { ideal: 30 },
  };

  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: videoConstraints,
    audio: true, // system audio if the user shares a tab/with-audio
  });

  let finalStream = screenStream;

  if (wantMic) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      if (screenStream.getAudioTracks().length > 0) {
        ctx.createMediaStreamSource(screenStream).connect(dest);
      }
      ctx.createMediaStreamSource(micStream).connect(dest);
      finalStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } catch {
      // Mic unavailable — continue with screen only
    }
  }

  // Stop when the user ends sharing via the browser's native bar
  screenStream.getVideoTracks()[0].addEventListener('ended', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
  });

  chunks = [];
  startTime = Date.now();

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const bitsPerSecond = quality === 'high' ? 4_000_000 : quality === 'medium' ? 2_500_000 : 1_000_000;

  mediaRecorder = new MediaRecorder(finalStream, { mimeType, videoBitsPerSecond: bitsPerSecond });
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  mediaRecorder.onstop = handleStop;
  mediaRecorder.start(1000);

  // Recording UI
  mainBtn.style.display = '';
  mainBtn.className = 'btn btn-stop';
  mainBtn.textContent = 'Stop Recording';
  timerEl.classList.add('show');
  elapsed = 0;
  timerInterval = setInterval(updateTimer, 1000);
  setStatus('● Recording…', 'recording');

  chrome.storage.local.set({ recording: true, startTime });
  chrome.runtime.sendMessage({ type: 'RECORDER_STARTED', startTime });
}

function showStartButton(message) {
  if (message) setStatus(message);
  mainBtn.style.display = '';
  mainBtn.className = 'btn btn-start';
  mainBtn.textContent = '▶ Start Recording';
}

function onStartError(e) {
  if (e && (e.name === 'NotAllowedError' || (e.message && e.message.includes('cancel')))) {
    // Either no user-gesture for auto-start, or the user dismissed the picker.
    showStartButton('Click “Start Recording”, then choose the screen to share.');
  } else {
    showStartButton('Error: ' + (e?.message || 'could not start recording'));
  }
}

mainBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
    return;
  }
  beginRecording().catch(onStartError);
});

function stopRecording() {
  clearInterval(timerInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  mainBtn.style.display = 'none';
  setStatus('Uploading…', 'uploading');
  timerEl.classList.remove('show');
}

async function handleStop() {
  const duration = Date.now() - startTime;
  const blob = new Blob(chunks, { type: 'video/webm' });
  chunks = [];

  try {
    const { sr_token } = await chrome.storage.local.get('sr_token');
    if (!sr_token) { showStartButton('Not logged in — please sign in via the extension popup.'); return; }

    const title = `Recording ${new Date().toLocaleString()}`;
    const form = new FormData();
    form.append('video', blob, 'recording.webm');
    form.append('title', title);
    form.append('duration', String(Math.floor(duration / 1000)));

    const res = await fetch(`${SERVER}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sr_token}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      showStartButton(res.status === 401
        ? 'Session expired — please sign in again via the extension popup.'
        : 'Upload failed: ' + (data.error || res.status));
      return;
    }
    const shareUrl = `https://screenrec.codingclicks.com/watch/${data.id}`;

    await chrome.storage.local.set({ shareLink: shareUrl, recording: false });
    chrome.runtime.sendMessage({ type: 'UPLOAD_DONE', url: shareUrl });

    linkUrl.textContent = shareUrl;
    openBtn.href = shareUrl;
    linkBox.classList.add('show');
    setStatus('Saved! Share the link with your client.', 'done');
    mainBtn.style.display = '';
    mainBtn.className = 'btn btn-start';
    mainBtn.textContent = '🎬 Record Another';
  } catch (e) {
    showStartButton('Upload failed: ' + e.message);
  }
}

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(linkUrl.textContent).then(() => {
    copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { copyBtn.textContent = '🔗 Copy Link'; }, 2000);
  });
});

// Allow the popup to remotely stop recording
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STOP_RECORDING') {
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
  }
});

// ── On load: pull the options chosen in the popup, then try to start
// immediately. If the browser blocks auto-start (needs a fresh gesture),
// we fall back to a single one-click Start button — no options to re-pick. ─────
(async () => {
  try {
    const { recOptions } = await chrome.storage.local.get('recOptions');
    if (recOptions) opts = recOptions;
  } catch {}
  setStatus('Preparing your recording…');
  beginRecording().catch(onStartError);
})();
