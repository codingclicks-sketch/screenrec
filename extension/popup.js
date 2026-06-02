const SERVER = 'http://localhost:3001';

const mainBtn = document.getElementById('mainBtn');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const optionsPanel = document.getElementById('optionsPanel');
const linkBox = document.getElementById('linkBox');
const linkUrl = document.getElementById('linkUrl');
const copyBtn = document.getElementById('copyBtn');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');

let currentLink = null;
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

// Restore state on popup open
chrome.storage.session.get(['recording', 'startTime', 'shareLink'], (data) => {
  if (data.recording) {
    elapsed = Math.floor((Date.now() - data.startTime) / 1000);
    showRecordingUI();
  }
  if (data.shareLink) {
    showLink(data.shareLink);
  }
});

function showRecordingUI() {
  mainBtn.textContent = 'Stop Recording';
  mainBtn.className = 'btn btn-stop';
  timerEl.style.display = 'block';
  optionsPanel.style.display = 'none';
  if (!timerInterval) timerInterval = setInterval(updateTimer, 1000);
  setStatus('Recording…', 'recording');
}

mainBtn.addEventListener('click', async () => {
  const isRecording = mainBtn.classList.contains('btn-stop');

  if (isRecording) {
    // Tell the recorder tab to stop
    chrome.runtime.sendMessage({ type: 'STOP_FROM_POPUP' });
    mainBtn.className = 'btn btn-disabled';
    mainBtn.textContent = 'Stopping…';
    clearInterval(timerInterval);
    timerInterval = null;
    setStatus('Processing…', 'uploading');
    progressWrap.classList.add('show');
    animateProgress();
    return;
  }

  // Open the recorder page as a new tab
  chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') });
  window.close(); // close popup so user focuses the recorder tab
});

function animateProgress() {
  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(p + 3, 90);
    progressBar.style.width = p + '%';
    if (p >= 90) clearInterval(iv);
  }, 200);
}

function showLink(url) {
  currentLink = url;
  linkUrl.textContent = url;
  linkBox.classList.add('show');
  progressBar.style.width = '100%';
  setTimeout(() => progressWrap.classList.remove('show'), 800);
}

copyBtn.addEventListener('click', () => {
  if (!currentLink) return;
  navigator.clipboard.writeText(currentLink).then(() => {
    copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { copyBtn.textContent = '🔗 Copy Link'; }, 2000);
  });
});

// Listen for upload completion from recorder tab
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPLOAD_DONE') {
    clearInterval(timerInterval);
    timerInterval = null;
    mainBtn.className = 'btn btn-record';
    mainBtn.textContent = 'Start Recording';
    timerEl.style.display = 'none';
    optionsPanel.style.display = 'block';
    setStatus('Recording saved! ✓', 'done');
    showLink(msg.url);
  }
  if (msg.type === 'RECORDER_STARTED') {
    chrome.storage.session.set({ recording: true, startTime: msg.startTime });
    elapsed = 0;
    showRecordingUI();
  }
});
