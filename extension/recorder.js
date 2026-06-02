const SERVER = 'https://screenrec-api-production.up.railway.app';

const mainBtn = document.getElementById('mainBtn');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const optionsPanel = document.getElementById('optionsPanel');
const linkBox = document.getElementById('linkBox');
const linkUrl = document.getElementById('linkUrl');
const copyBtn = document.getElementById('copyBtn');
const audioCheck = document.getElementById('audioCheck');
const qualitySelect = document.getElementById('qualitySelect');

let mediaRecorder = null;
let chunks = [];
let startTime = null;
let timerInterval = null;
let elapsed = 0;

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

mainBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
    return;
  }

  mainBtn.className = 'btn btn-disabled';
  mainBtn.textContent = 'Starting…';
  setStatus('Select a screen or window to share…');

  try {
    const quality = qualitySelect.value;
    const wantMic = audioCheck.checked;

    const videoConstraints = {
      width: { ideal: quality === 'high' ? 1920 : quality === 'medium' ? 1280 : 854 },
      height: { ideal: quality === 'high' ? 1080 : quality === 'medium' ? 720 : 480 },
      frameRate: { ideal: 30 },
    };

    // Get screen stream
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: true, // system audio if available
    });

    let finalStream = screenStream;

    // Mix in microphone if requested
    if (wantMic) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        // Mix screen audio + mic
        if (screenStream.getAudioTracks().length > 0) {
          ctx.createMediaStreamSource(screenStream).connect(dest);
        }
        ctx.createMediaStreamSource(micStream).connect(dest);
        finalStream = new MediaStream([
          ...screenStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      } catch {
        // Mic unavailable, continue with screen only
      }
    }

    // Stop recording when user ends share via browser UI
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

    // Update UI
    optionsPanel.style.display = 'none';
    timerEl.classList.add('show');
    elapsed = 0;
    timerInterval = setInterval(updateTimer, 1000);
    mainBtn.className = 'btn btn-stop';
    mainBtn.textContent = 'Stop Recording';
    setStatus('● Recording…', 'recording');

    // Notify background so popup can reflect state
    chrome.runtime.sendMessage({ type: 'RECORDER_STARTED', startTime });

  } catch (e) {
    if (e.name === 'NotAllowedError' || e.message.includes('cancel')) {
      setStatus('Cancelled.');
    } else {
      setStatus('Error: ' + e.message);
    }
    mainBtn.className = 'btn btn-start';
    mainBtn.textContent = 'Start Recording';
  }
});

function stopRecording() {
  clearInterval(timerInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  mainBtn.className = 'btn btn-disabled';
  mainBtn.textContent = 'Uploading…';
  setStatus('Uploading…', 'uploading');
  timerEl.classList.remove('show');
}

async function handleStop() {
  const duration = Date.now() - startTime;
  const blob = new Blob(chunks, { type: 'video/webm' });
  chunks = [];

  try {
    const title = `Recording ${new Date().toLocaleString()}`;
    const form = new FormData();
    form.append('video', blob, 'recording.webm');
    form.append('title', title);
    form.append('duration', String(Math.floor(duration / 1000)));

    const res = await fetch(`${SERVER}/api/upload`, { method: 'POST', body: form });
    const data = await res.json();
    const shareUrl = `${SERVER}/watch/${data.id}`;

    // Save to session so popup also sees it
    await chrome.storage.session.set({ shareLink: shareUrl, recording: false });
    chrome.runtime.sendMessage({ type: 'UPLOAD_DONE', url: shareUrl });

    linkUrl.textContent = shareUrl;
    linkBox.classList.add('show');
    setStatus('Saved! Share the link with your client.', 'done');
    mainBtn.className = 'btn btn-start';
    mainBtn.textContent = 'Record Again';
    optionsPanel.style.display = 'block';
  } catch (e) {
    setStatus('Upload failed: ' + e.message);
    mainBtn.className = 'btn btn-start';
    mainBtn.textContent = 'Start Recording';
    optionsPanel.style.display = 'block';
  }
}

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(linkUrl.textContent).then(() => {
    copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { copyBtn.textContent = '🔗 Copy Shareable Link'; }, 2000);
  });
});

// Allow popup to remotely stop recording
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STOP_RECORDING') {
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
  }
});
