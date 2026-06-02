const SERVER = 'https://screenrec-api-production.up.railway.app';

// ── Elements ──────────────────────────────────────────────────────────────────
const authPanel     = document.getElementById('authPanel');
const recorderPanel = document.getElementById('recorderPanel');
const authTitle     = document.getElementById('authTitle');
const authSub       = document.getElementById('authSub');
const authError     = document.getElementById('authError');
const authBtn       = document.getElementById('authBtn');
const nameField     = document.getElementById('nameField');
const nameInput     = document.getElementById('nameInput');
const emailInput    = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const toggleAuth    = document.getElementById('toggleAuth');
const headerUser    = document.getElementById('userChip');
const signOutBtn    = document.getElementById('signOutBtn');

const mainBtn       = document.getElementById('mainBtn');
const statusEl      = document.getElementById('status');
const timerEl       = document.getElementById('timer');
const optionsPanel  = document.getElementById('optionsPanel');
const linkBox       = document.getElementById('linkBox');
const linkUrl       = document.getElementById('linkUrl');
const copyBtn       = document.getElementById('copyBtn');
const progressWrap  = document.getElementById('progressWrap');
const progressBar   = document.getElementById('progressBar');
const audioCheck    = document.getElementById('audioCheck');
const qualitySelect = document.getElementById('qualitySelect');

let isSignup = false;
let isRecording = false;
let timerInterval = null;
let elapsed = 0;
let currentLink = null;

// ── Auth state ────────────────────────────────────────────────────────────────
function toggleMode() {
  isSignup = !isSignup;
  authTitle.textContent = isSignup ? 'Create account' : 'Sign in';
  authSub.textContent   = isSignup ? 'Start recording for free' : 'to start recording';
  authBtn.textContent   = isSignup ? 'Create Account' : 'Sign In';
  nameField.style.display = isSignup ? 'block' : 'none';
  toggleAuth.innerHTML = isSignup
    ? 'Have an account? <span onclick="toggleMode()">Sign in</span>'
    : 'No account? <span onclick="toggleMode()">Sign up</span>';
  authError.textContent = '';
}

authBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const name = nameInput.value.trim();
  if (!email || !password) { authError.textContent = 'Email and password required'; return; }
  if (isSignup && !name) { authError.textContent = 'Name required'; return; }

  authBtn.disabled = true;
  authBtn.textContent = isSignup ? 'Creating…' : 'Signing in…';
  authError.textContent = '';

  try {
    const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
    const body = isSignup ? { name, email, password } : { email, password };
    const res = await fetch(`${SERVER}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { authError.textContent = data.error; return; }

    await chrome.storage.local.set({ sr_token: data.token, sr_user: data.user });
    showRecorder(data.user);
  } catch (e) {
    authError.textContent = 'Network error';
  } finally {
    authBtn.disabled = false;
    authBtn.textContent = isSignup ? 'Create Account' : 'Sign In';
  }
});

function signOut() {
  chrome.storage.local.remove(['sr_token', 'sr_user', 'recording', 'startTime', 'shareLink']);
  showAuth();
}

function showAuth() {
  authPanel.style.display = 'block';
  recorderPanel.style.display = 'none';
  headerUser.innerHTML = '';
  signOutBtn.style.display = 'none';
}

function showRecorder(user) {
  authPanel.style.display = 'none';
  recorderPanel.style.display = 'block';
  const name = user?.name || user?.email || '';
  const initial = (name || '?').charAt(0).toUpperCase();
  headerUser.innerHTML = `<span class="av">${initial}</span>`;
  headerUser.title = name;
  signOutBtn.style.display = 'block';
}

// ── Init: check stored token ──────────────────────────────────────────────────
chrome.storage.local.get(['sr_token', 'sr_user', 'recording', 'startTime', 'shareLink'], (data) => {
  if (data.sr_token && data.sr_user) {
    showRecorder(data.sr_user);
    if (data.recording) {
      isRecording = true;
      elapsed = Math.floor((Date.now() - data.startTime) / 1000);
      showRecordingUI();
    }
    if (data.shareLink) showLink(data.shareLink);
  } else {
    showAuth();
  }
});

// ── Recording ─────────────────────────────────────────────────────────────────
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

function showRecordingUI() {
  mainBtn.textContent = 'Stop Recording';
  mainBtn.className = 'btn btn-stop';
  timerEl.style.display = 'block';
  optionsPanel.style.display = 'none';
  if (!timerInterval) timerInterval = setInterval(updateTimer, 1000);
  setStatus('Recording…', 'recording');
}

mainBtn.addEventListener('click', async () => {
  if (isRecording) {
    // Broadcast directly to the recorder page (no background/tabs permission needed)
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    mainBtn.className = 'btn btn-disabled';
    mainBtn.textContent = 'Stopping…';
    clearInterval(timerInterval); timerInterval = null;
    setStatus('Processing…', 'uploading');
    progressWrap.classList.add('show');
    animateProgress();
    return;
  }
  // Carry the chosen options to the recorder page so they aren't re-selected.
  const cameraSelect = document.getElementById('cameraSelect');
  const countdownCheck = document.getElementById('countdownCheck');
  const camera = cameraSelect ? cameraSelect.value : 'off';

  let bubbleTabId = null;
  // For "screen + camera bubble", inject a floating camera overlay onto the
  // current tab so it's captured natively (records fine even when minimized).
  if (camera === 'bubble') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id && /^https?:/.test(tab.url || '')) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['bubble.js'] });
        bubbleTabId = tab.id;
      }
    } catch (e) { /* injection not allowed on this page — bubble just won't show */ }
  }

  await chrome.storage.local.set({
    recOptions: {
      audio: audioCheck.checked,
      quality: qualitySelect.value,
      camera,
      countdown: countdownCheck ? countdownCheck.checked : true,
      bubbleTabId,
    },
  });

  // Recorder lives in a small control window. It records the screen track
  // directly now, so it's safe to minimize — recording continues.
  chrome.windows.create({
    url: chrome.runtime.getURL('recorder.html'),
    type: 'popup',
    width: 420,
    height: 560,
  });
  window.close();
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
  const openBtn = document.getElementById('openBtn');
  if (openBtn) openBtn.href = url;
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

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPLOAD_DONE') {
    isRecording = false;
    mainBtn.className = 'btn btn-record';
    mainBtn.textContent = 'Start Recording';
    timerEl.style.display = 'none';
    optionsPanel.style.display = 'block';
    setStatus('Saved! ✓', 'done');
    showLink(msg.url);
  }
  if (msg.type === 'RECORDER_STARTED') {
    chrome.storage.local.set({ recording: true, startTime: msg.startTime });
    elapsed = 0;
    showRecordingUI();
  }
});
