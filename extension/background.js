// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND SERVICE WORKER
//
// Keeps the on-screen recording overlay (toolbar + camera bubble) present on
// whatever browser tab is active during a recording — so it "follows" you when
// you switch tabs and stays on top within the browser. It watches tab
// activation/navigation and re-injects overlay.js while recState.recording.
//
// NOTE: a Chrome extension cannot draw over OTHER desktop apps (only a native /
// Electron app can do OS-level always-on-top). This keeps the overlay on top
// across all browser tabs, which is the cross-tab behavior requested.
// ─────────────────────────────────────────────────────────────────────────────
let recording = false;

function syncFromStorage() {
  chrome.storage.local.get('recState', (d) => { recording = !!(d.recState && d.recState.recording); });
}
syncFromStorage();

// recState is the single source of truth (written by recorder.js).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.recState) {
    recording = !!(changes.recState.newValue && changes.recState.newValue.recording);
  }
});

function injectOverlay(tabId, url) {
  if (!recording) return;
  if (!url || !/^https?:/.test(url)) return; // can't inject into chrome:// or store pages
  chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] }).catch(() => {});
}

// When the user switches to another tab, drop the overlay onto it.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (!recording) return;
  chrome.tabs.get(tabId, (tab) => { if (!chrome.runtime.lastError && tab) injectOverlay(tabId, tab.url); });
});

// When a tab finishes (re)loading a page, (re)inject so the overlay survives nav.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (recording && info.status === 'complete') injectOverlay(tabId, tab.url);
});

// Also catch explicit start messages (covers SW cold-starts) and auth-sync
// messages from bridge.js (the veorec.com content script).
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'RECORDER_STARTED') recording = true;
  // Website signed in → mirror the token into the extension (clear sr_user so
  // the popup re-fetches the fresh profile).
  if (msg.type === 'SR_AUTH_SYNC' && msg.token) {
    chrome.storage.local.get('sr_token', ({ sr_token }) => {
      if (sr_token !== msg.token) chrome.storage.local.set({ sr_token: msg.token, sr_user: null });
    });
  }
  // Website signed out → drop the extension session too.
  if (msg.type === 'SR_AUTH_CLEAR') {
    chrome.storage.local.remove(['sr_token', 'sr_user']);
  }
  // Website "Record" button → start a recording with sensible defaults. The
  // recorder window auto-starts the screen picker on load (see recorder.js).
  if (msg.type === 'SR_START_RECORDING') {
    const o = msg.options || {};
    const recOptions = {
      audio: o.audio !== false,
      quality: o.quality || 'high',
      camera: o.camera || 'off',
      bubbleSize: o.bubbleSize || 'md',
      countdown: o.countdown != null ? o.countdown : 3,
      surface: o.surface || 'monitor',
      bubbleTabId: null,
    };
    chrome.storage.local.set({ recOptions }, () => {
      chrome.windows.create({ url: chrome.runtime.getURL('recorder.html'), type: 'popup', width: 420, height: 560 });
    });
  }
});
