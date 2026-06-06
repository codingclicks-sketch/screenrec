const SERVER = 'https://screenrec-api-production.up.railway.app';

// ── Elements ──────────────────────────────────────────────────────────────────
const topActions   = document.getElementById('topActions');
const userChip     = document.getElementById('userChip');
const authPanel    = document.getElementById('authPanel');
const authTitle    = document.getElementById('authTitle');
const authSub      = document.getElementById('authSub');
const authError    = document.getElementById('authError');
const authBtn      = document.getElementById('authBtn');
const nameField    = document.getElementById('nameField');
const nameInput    = document.getElementById('nameInput');
const emailInput   = document.getElementById('emailInput');
const passwordInput= document.getElementById('passwordInput');
const toggleAuth   = document.getElementById('toggleAuth');
const recorderPanel= document.getElementById('recorderPanel');

const surfaceWrap  = document.getElementById('surface');
const cameraRow    = document.getElementById('cameraRow');
const cameraVal    = document.getElementById('cameraVal');
const micRow       = document.getElementById('micRow');
const micVal       = document.getElementById('micVal');
const qualityRow   = document.getElementById('qualityRow');
const qualityVal   = document.getElementById('qualityVal');
const countdownRow = document.getElementById('countdownRow');
const countdownVal = document.getElementById('countdownVal');

const mainBtn      = document.getElementById('mainBtn');
const statusEl     = document.getElementById('status');
const timerEl      = document.getElementById('timer');
const freeNote     = document.getElementById('freeNote');
const linkBox      = document.getElementById('linkBox');
const latestTitle  = document.getElementById('latestTitle');
const linkUrl      = document.getElementById('linkUrl');
const copyBtn      = document.getElementById('copyBtn');
const copyBtnDefault = copyBtn.innerHTML;

// ── State ─────────────────────────────────────────────────────────────────────
let isSignup = false;
let isRecording = false;
let timerInterval = null;
let elapsed = 0;
let currentLink = null;

const opts = { surface: 'monitor', camera: 'off', bubbleSize: 'md', audio: true, quality: 'high', countdown: 3 };

// Panels under each option, mirroring the in-app option picker (Loom-style).
const cameraPanel    = document.getElementById('cameraPanel');
const micPanel       = document.getElementById('micPanel');
const qualityPanel   = document.getElementById('qualityPanel');
const countdownPanel = document.getElementById('countdownPanel');

const CHOICES = {
  camera: [
    { label: 'Off', set: { camera: 'off' } },
    { label: 'Camera bubble · Small', set: { camera: 'bubble', bubbleSize: 'sm' } },
    { label: 'Camera bubble · Medium', set: { camera: 'bubble', bubbleSize: 'md' } },
    { label: 'Camera bubble · Large', set: { camera: 'bubble', bubbleSize: 'lg' } },
    { label: 'Camera only', set: { camera: 'only' } },
  ],
  audio: [ { label: 'On', set: { audio: true } }, { label: 'Off', set: { audio: false } } ],
  quality: [
    { label: '1080p (HD)', set: { quality: 'high' } },
    { label: '720p', set: { quality: 'medium' } },
    { label: '480p', set: { quality: 'low' } },
  ],
  countdown: [
    { label: 'Off', set: { countdown: false } },
    { label: '3 seconds', set: { countdown: 3 } },
    { label: '5 seconds', set: { countdown: 5 } },
  ],
};

function cameraLabel() {
  if (opts.camera === 'off') return 'Off';
  if (opts.camera === 'only') return 'Camera only';
  return 'Bubble · ' + ({ sm: 'S', md: 'M', lg: 'L' }[opts.bubbleSize] || 'M');
}
const QUALITY_LABELS = { high: '1080p', medium: '720p', low: '480p' };

function render() {
  cameraVal.textContent = cameraLabel();
  qualityVal.textContent = QUALITY_LABELS[opts.quality];
  micVal.textContent = opts.audio ? 'On' : 'Off';
  micVal.className = 'pill ' + (opts.audio ? 'on' : 'off');
  countdownVal.textContent = opts.countdown ? (opts.countdown + ' sec') : 'Off';
  countdownVal.className = 'pill ' + (opts.countdown ? 'on' : 'off');
  surfaceWrap.querySelectorAll('.surf').forEach(b => {
    b.classList.toggle('active', b.dataset.surface === opts.surface);
  });
}

// A choice is active if every key in its `set` matches current opts.
function isChoiceActive(choice) {
  return Object.keys(choice.set).every(k => opts[k] === choice.set[k]);
}

function buildPanel(panelEl, key) {
  panelEl.innerHTML = '';
  CHOICES[key].forEach(choice => {
    const b = document.createElement('button');
    b.className = 'choice' + (isChoiceActive(choice) ? ' active' : '');
    b.innerHTML = `<span>${choice.label}</span><span class="tick">✓</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      Object.assign(opts, choice.set);
      render();
      closeAllPanels();
    });
    panelEl.appendChild(b);
  });
}

function closeAllPanels() {
  [cameraPanel, micPanel, qualityPanel, countdownPanel].forEach(p => p.classList.remove('open'));
  [cameraRow, micRow, qualityRow, countdownRow].forEach(r => r.classList.remove('expanded'));
}

function togglePanel(row, panel, key) {
  const isOpen = panel.classList.contains('open');
  closeAllPanels();
  if (!isOpen) { buildPanel(panel, key); panel.classList.add('open'); row.classList.add('expanded'); }
}

// ── Option interactions (open a choice panel instead of cycling) ─────────────
cameraRow.addEventListener('click', () => togglePanel(cameraRow, cameraPanel, 'camera'));
micRow.addEventListener('click', () => togglePanel(micRow, micPanel, 'audio'));
qualityRow.addEventListener('click', () => togglePanel(qualityRow, qualityPanel, 'quality'));
countdownRow.addEventListener('click', () => togglePanel(countdownRow, countdownPanel, 'countdown'));
surfaceWrap.querySelectorAll('.surf').forEach(b => {
  b.addEventListener('click', () => { opts.surface = b.dataset.surface; render(); });
});

// ── Auth ────────────────────────────────────────────────────────────────────
function toggleMode() {
  isSignup = !isSignup;
  authTitle.textContent = isSignup ? 'Create account' : 'Sign in';
  authSub.textContent = isSignup ? 'Start recording for free' : 'to start recording';
  authBtn.textContent = isSignup ? 'Create Account' : 'Sign In';
  nameField.style.display = isSignup ? 'block' : 'none';
  toggleAuth.innerHTML = isSignup
    ? 'Have an account? <span onclick="toggleMode()">Sign in</span>'
    : 'No account? <span onclick="toggleMode()">Sign up</span>';
  authError.textContent = '';
}
window.toggleMode = toggleMode;

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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { authError.textContent = data.error; return; }
    await chrome.storage.local.set({ sr_token: data.token, sr_user: data.user });
    showRecorder(data.user);
  } catch { authError.textContent = 'Network error'; }
  finally { authBtn.disabled = false; authBtn.textContent = isSignup ? 'Create Account' : 'Sign In'; }
});

function signOut() {
  chrome.storage.local.remove(['sr_token', 'sr_user', 'recording', 'startTime', 'shareLink', 'lastRecording']);
  showAuth();
}
window.signOut = signOut;

function showAuth() {
  authPanel.style.display = 'block';
  recorderPanel.style.display = 'none';
  topActions.style.display = 'none';
}
function showRecorder(user) {
  authPanel.style.display = 'none';
  recorderPanel.style.display = 'block';
  topActions.style.display = 'flex';
  userChip.textContent = (user?.name || user?.email || '?').charAt(0).toUpperCase();
  userChip.title = user?.name || '';
  render();
}

// ── Recording lifecycle ───────────────────────────────────────────────────────
function setStatus(msg, cls = '') { statusEl.textContent = msg; statusEl.className = 'status ' + cls; }

function updateTimer() {
  elapsed++;
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  timerEl.textContent = `${m}:${String(elapsed % 60).padStart(2, '0')}`;
}

function showRecordingUI() {
  mainBtn.className = 'btn-record stop';
  mainBtn.innerHTML = '⏹ Stop Recording';
  timerEl.style.display = 'block';
  document.querySelector('.opts').style.display = 'none';
  surfaceWrap.style.display = 'none';
  freeNote.style.display = 'none';
  if (!timerInterval) timerInterval = setInterval(updateTimer, 1000);
  setStatus('● Recording…', 'recording');
}

mainBtn.addEventListener('click', async () => {
  if (isRecording) {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    mainBtn.className = 'btn-record disabled';
    mainBtn.innerHTML = 'Stopping…';
    clearInterval(timerInterval); timerInterval = null;
    setStatus('Processing…', 'uploading');
    return;
  }
  // Inject the on-screen overlay (draggable control toolbar + camera bubble)
  // onto the active tab so controls/camera are visible IN the recording. The
  // recorder window drives MediaRecorder and talks to this overlay by tab id.
  let bubbleTabId = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && /^https?:/.test(tab.url || '')) {
      // Save options first so the overlay can read camera mode on inject.
      await chrome.storage.local.set({
        recOptions: { audio: opts.audio, quality: opts.quality, camera: opts.camera, bubbleSize: opts.bubbleSize, countdown: opts.countdown, surface: opts.surface, bubbleTabId: tab.id },
      });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
      bubbleTabId = tab.id;
    }
  } catch (e) {}
  await chrome.storage.local.set({
    recOptions: { audio: opts.audio, quality: opts.quality, camera: opts.camera, bubbleSize: opts.bubbleSize, countdown: opts.countdown, surface: opts.surface, bubbleTabId },
  });
  chrome.windows.create({ url: chrome.runtime.getURL('recorder.html'), type: 'popup', width: 420, height: 560 });
  window.close();
});

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString();
}

function showLatest(rec) {
  if (!rec || !rec.url) return;
  currentLink = rec.url;
  latestTitle.textContent = rec.title || 'Screen recording';
  latestTitle.href = rec.url;
  linkUrl.textContent = timeAgo(rec.at || Date.now());
  linkBox.classList.add('show');
}

// Dismiss the Latest Recording card — hides it without deleting the video.
const latestClose = document.getElementById('latestClose');
if (latestClose) latestClose.addEventListener('click', () => {
  linkBox.classList.remove('show');
  currentLink = null;
  chrome.storage.local.remove('lastRecording');
});

copyBtn.addEventListener('click', () => {
  if (!currentLink) return;
  navigator.clipboard.writeText(currentLink).then(() => {
    copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { copyBtn.innerHTML = copyBtnDefault; }, 2000);
  });
});

// ── Live messages from the recorder window ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPLOAD_DONE') {
    isRecording = false;
    clearInterval(timerInterval); timerInterval = null;
    showLatest({ url: msg.url, title: msg.title, at: Date.now() });
    // restore the idle UI
    mainBtn.className = 'btn-record';
    mainBtn.innerHTML = '<span class="rdot"></span> Start Recording';
    timerEl.style.display = 'none';
    document.querySelector('.opts').style.display = '';
    surfaceWrap.style.display = '';
    freeNote.style.display = '';
    setStatus('Saved! ✓', 'done');
  }
  if (msg.type === 'RECORDER_STARTED') {
    chrome.storage.local.set({ recording: true, startTime: msg.startTime });
    isRecording = true; elapsed = 0; showRecordingUI();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get(['sr_token', 'sr_user', 'recording', 'startTime', 'lastRecording'], (data) => {
  if (data.sr_token && data.sr_user) {
    showRecorder(data.sr_user);
    if (data.recording) { isRecording = true; elapsed = Math.floor((Date.now() - data.startTime) / 1000); showRecordingUI(); }
    if (data.lastRecording) showLatest(data.lastRecording);
  } else {
    showAuth();
  }
});
