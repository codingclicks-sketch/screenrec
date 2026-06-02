const SERVER = 'https://screenrec-api-production.up.railway.app';

const mainBtn   = document.getElementById('mainBtn');
const controls  = document.getElementById('controls');
const pauseBtn  = document.getElementById('pauseBtn');
const stopBtn   = document.getElementById('stopBtn');
const statusEl  = document.getElementById('status');
const timerEl   = document.getElementById('timer');
const linkBox   = document.getElementById('linkBox');
const linkUrl   = document.getElementById('linkUrl');
const copyBtn   = document.getElementById('copyBtn');
const openBtn   = document.getElementById('openBtn');
const previewWrap = document.getElementById('previewWrap');
const canvas    = document.getElementById('previewCanvas');
const countdownEl  = document.getElementById('countdown');
const countdownNum = document.getElementById('countdownNum');

let mediaRecorder = null;
let chunks = [];
let startTime = null;
let pausedAccum = 0;       // total paused ms
let pauseStartedAt = null;
let timerInterval = null;
let rafId = null;
let audioCtx = null;
let activeStreams = [];    // all source streams to stop at the end

// Options carried over from the popup
let opts = { quality: 'medium', audio: true, camera: 'off', countdown: true };

function setStatus(msg, cls = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + cls;
}

function elapsedSeconds() {
  const paused = pausedAccum + (pauseStartedAt ? Date.now() - pauseStartedAt : 0);
  return Math.floor((Date.now() - startTime - paused) / 1000);
}

function updateTimer() {
  const s = elapsedSeconds();
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  timerEl.textContent = `${m}:${String(s % 60).padStart(2, '0')}`;
}

function videoSize(quality) {
  return quality === 'high' ? { w: 1920, h: 1080 }
       : quality === 'medium' ? { w: 1280, h: 720 }
       : { w: 854, h: 480 };
}

async function playStreamInVideo(stream) {
  const v = document.createElement('video');
  v.srcObject = stream;
  v.muted = true;
  v.playsInline = true;
  await v.play();
  // wait for dimensions
  if (!v.videoWidth) await new Promise(r => v.addEventListener('loadedmetadata', r, { once: true }));
  return v;
}

function countdown() {
  if (!opts.countdown) return Promise.resolve();
  return new Promise(resolve => {
    let n = 3;
    countdownNum.textContent = n;
    countdownEl.classList.add('show');
    const iv = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(iv);
        countdownEl.classList.remove('show');
        resolve();
      } else {
        countdownNum.textContent = n;
        // restart pop animation
        countdownNum.style.animation = 'none';
        void countdownNum.offsetWidth;
        countdownNum.style.animation = '';
      }
    }, 1000);
  });
}

async function beginRecording() {
  mainBtn.style.display = 'none';
  linkBox.classList.remove('show');
  controls.style.display = 'none';
  setStatus(opts.camera === 'only' ? 'Starting camera…' : 'Select a screen or window to share…');

  const { w: maxW, h: maxH } = videoSize(opts.quality);
  const wantMic = opts.audio !== false;
  const cam = opts.camera || 'off';

  let screenStream = null, camStream = null, micStream = null;

  // ── Acquire sources ──────────────────────────────────────────────────────
  if (cam !== 'only') {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: maxW }, height: { ideal: maxH }, frameRate: { ideal: 30 } },
      audio: true,
    });
    activeStreams.push(screenStream);
  }
  if (cam === 'bubble' || cam === 'only') {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
    });
    activeStreams.push(camStream);
  }
  if (wantMic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      activeStreams.push(micStream);
    } catch { /* mic unavailable */ }
  }

  // If the user ends screen share via the browser bar, stop.
  if (screenStream) {
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') stopRecording();
    });
  }

  // ── Build the video track ────────────────────────────────────────────────
  let videoTrack;
  if (cam === 'off') {
    videoTrack = screenStream.getVideoTracks()[0];
    previewWrap.classList.remove('show');
  } else {
    // Composite to a canvas (bubble = screen + cam circle, only = cam fullscreen)
    const screenVideo = screenStream ? await playStreamInVideo(screenStream) : null;
    const camVideo = await playStreamInVideo(camStream);

    if (cam === 'only') {
      // Record the camera track DIRECTLY (native capture never throttles in the
      // background). The canvas is used only for an on-screen preview.
      videoTrack = camStream.getVideoTracks()[0];
      canvas.width = camVideo.videoWidth || 640;
      canvas.height = camVideo.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      previewWrap.classList.add('show');
      const draw = () => { ctx.drawImage(camVideo, 0, 0, canvas.width, canvas.height); rafId = requestAnimationFrame(draw); };
      draw();
    } else {
      // Bubble: composite screen + circular camera onto a canvas and record it.
      canvas.width = screenVideo.videoWidth || maxW;
      canvas.height = screenVideo.videoHeight || maxH;
      const ctx = canvas.getContext('2d');
      previewWrap.classList.add('show');
      const draw = () => {
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        const r = Math.round(Math.min(canvas.width, canvas.height) * 0.16);
        const margin = Math.round(r * 0.4);
        const cx = margin + r, cy = canvas.height - margin - r;
        const cw = camVideo.videoWidth, ch = camVideo.videoHeight;
        const side = Math.min(cw, ch);            // center-crop to square
        const sx = (cw - side) / 2, sy = (ch - side) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(camVideo, sx, sy, side, side, cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
        ctx.strokeStyle = '#7c5cfc';
        ctx.lineWidth = Math.max(2, r * 0.05);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        rafId = requestAnimationFrame(draw);
      };
      draw();
      videoTrack = canvas.captureStream(30).getVideoTracks()[0];
    }
  }

  // ── Mix audio (screen audio + mic) ────────────────────────────────────────
  const audioTracks = [];
  const screenAudio = screenStream ? screenStream.getAudioTracks() : [];
  if ((screenAudio.length || micStream) ) {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    if (screenAudio.length) audioCtx.createMediaStreamSource(screenStream).connect(dest);
    if (micStream) audioCtx.createMediaStreamSource(micStream).connect(dest);
    audioTracks.push(...dest.stream.getAudioTracks());
  }

  const finalStream = new MediaStream([videoTrack, ...audioTracks]);

  // ── Countdown, then record ───────────────────────────────────────────────
  setStatus('Get ready…');
  await countdown();

  chunks = [];
  startTime = Date.now();
  pausedAccum = 0;
  pauseStartedAt = null;

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';
  const bitsPerSecond = opts.quality === 'high' ? 4_000_000 : opts.quality === 'medium' ? 2_500_000 : 1_000_000;

  mediaRecorder = new MediaRecorder(finalStream, { mimeType, videoBitsPerSecond: bitsPerSecond });
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  mediaRecorder.onstop = handleStop;
  mediaRecorder.start(1000);

  // UI: recording
  controls.style.display = 'flex';
  pauseBtn.textContent = '⏸ Pause';
  timerEl.classList.add('show');
  updateTimer();
  timerInterval = setInterval(updateTimer, 500);
  setStatus(cam === 'bubble' ? '● Recording… keep this window visible' : '● Recording…', 'recording');

  chrome.storage.local.set({ recording: true, startTime });
  chrome.runtime.sendMessage({ type: 'RECORDER_STARTED', startTime });
}

function togglePause() {
  if (!mediaRecorder) return;
  if (mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    pauseStartedAt = Date.now();
    pauseBtn.textContent = '▶ Resume';
    setStatus('⏸ Paused', 'uploading');
  } else if (mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    if (pauseStartedAt) { pausedAccum += Date.now() - pauseStartedAt; pauseStartedAt = null; }
    pauseBtn.textContent = '⏸ Pause';
    setStatus('● Recording…', 'recording');
  }
}

function showStartButton(message) {
  if (message) setStatus(message);
  controls.style.display = 'none';
  previewWrap.classList.remove('show');
  mainBtn.style.display = '';
  mainBtn.className = 'btn btn-start';
  mainBtn.textContent = '▶ Start Recording';
}

function onStartError(e) {
  cleanupStreams();
  if (e && (e.name === 'NotAllowedError' || (e.message && e.message.includes('cancel')))) {
    showStartButton('Click “Start Recording”, then choose what to share.');
  } else {
    showStartButton('Error: ' + (e?.message || 'could not start recording'));
  }
}

function cleanupStreams() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  activeStreams.forEach(s => s.getTracks().forEach(t => t.stop()));
  activeStreams = [];
  if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
}

mainBtn.addEventListener('click', () => beginRecording().catch(onStartError));
pauseBtn.addEventListener('click', togglePause);
stopBtn.addEventListener('click', stopRecording);

function stopRecording() {
  clearInterval(timerInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  cleanupStreams();
  controls.style.display = 'none';
  previewWrap.classList.remove('show');
  setStatus('Uploading…', 'uploading');
  timerEl.classList.remove('show');
}

async function handleStop() {
  const duration = elapsedSeconds();
  const blob = new Blob(chunks, { type: 'video/webm' });
  chunks = [];

  try {
    const { sr_token } = await chrome.storage.local.get('sr_token');
    if (!sr_token) { showStartButton('Not logged in — please sign in via the extension popup.'); return; }

    const title = `Recording ${new Date().toLocaleString()}`;
    const form = new FormData();
    form.append('video', blob, 'recording.webm');
    form.append('title', title);
    form.append('duration', String(duration));

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

// Popup can remotely stop
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STOP_RECORDING' && mediaRecorder && mediaRecorder.state !== 'inactive') {
    stopRecording();
  }
});

// On load: read options carried from popup, then try to auto-start.
(async () => {
  try {
    const { recOptions } = await chrome.storage.local.get('recOptions');
    if (recOptions) opts = { ...opts, ...recOptions };
  } catch {}
  setStatus('Preparing your recording…');
  beginRecording().catch(onStartError);
})();
