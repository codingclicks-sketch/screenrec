// Runs on veorec.com. When the user is signed in on the website, copy the
// session token into the extension so the popup is signed in too — no auth form
// in the extension. Also clears the extension session when the website logs out.
(function () {
  let last = null;

  function sync() {
    let token = null;
    try { token = localStorage.getItem('sr_token'); } catch (e) { return; }
    if (token === last) return;            // nothing changed
    last = token;
    try {
      if (token) chrome.runtime.sendMessage({ type: 'SR_AUTH_SYNC', token });
      else chrome.runtime.sendMessage({ type: 'SR_AUTH_CLEAR' });
    } catch (e) { /* extension reloaded / context gone */ }
  }

  sync();
  // The `storage` event only fires for changes made in OTHER tabs. The web app is
  // an SPA (login sets the token in THIS tab with no reload), so we also poll —
  // cheaply, since sync() only sends a message when the token actually changes.
  window.addEventListener('storage', (e) => { if (e.key === 'sr_token') sync(); });
  setInterval(sync, 2000);
})();
