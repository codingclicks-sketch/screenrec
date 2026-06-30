// ─────────────────────────────────────────────────────────────────────────────
// VeoRec → Gmail compose button (Loom-style).
// Injects a "🎬 Video" button into Gmail's compose send-row. Clicking it lists
// your recent VeoRec recordings; picking one drops a clickable video thumbnail
// (play button baked in) into the email draft. Raw DOM + MutationObserver — no
// dependency, aria/role-based selectors (stable across Gmail's class churn).
// ─────────────────────────────────────────────────────────────────────────────
(() => {
  if (window.__veorecGmail) return;          // one init per page
  window.__veorecGmail = true;
  const WEB = 'https://veorec.com';

  // Cloudinary: poster frame + a baked-in white ▶ overlay → looks like a video.
  // Baked into the image (NOT CSS) because Gmail strips CSS overlays on send.
  const PLAY_TX = 'so_1,w_640,h_360,c_fill,q_auto,f_jpg/co_white,l_text:Arial_130_bold:%E2%96%B6/o_85/fl_layer_apply,g_center';
  function playThumb(videoUrl) {
    return String(videoUrl || '')
      .replace('/upload/', `/upload/${PLAY_TX}/`)
      .replace(/\.(webm|mp4|mov|mkv)(\?.*)?$/i, '.jpg');
  }
  const esc = (s) => String(s || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  // Email-SAFE HTML (inline styles only, table layout, a>img) — survives Gmail send.
  function cardHtml(rec) {
    const watch = `${WEB}/watch/${rec.id}`;
    const title = esc(rec.title || 'My recording');
    const thumb = playThumb(rec.filename || rec.thumbnail || '');
    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:480px;margin:10px 0;">` +
      `<tr><td style="padding:0;"><a href="${watch}" target="_blank" rel="noopener" style="text-decoration:none;display:block;">` +
      `<img src="${thumb}" width="480" height="270" alt="Watch the recording" style="display:block;width:100%;max-width:480px;height:auto;border:0;outline:none;border-radius:10px;" /></a></td></tr>` +
      `<tr><td style="padding:8px 2px 0;font-family:Arial,Helvetica,sans-serif;">` +
      `<a href="${watch}" target="_blank" rel="noopener" style="font-size:15px;font-weight:bold;color:#111827;text-decoration:none;">▶&nbsp;${title}</a>` +
      `<div style="margin-top:3px;font-size:12px;color:#6b7280;">Watch on VeoRec</div></td></tr></table><br>`
    );
  }

  // Insert at the caret in the compose body, then tell Gmail's model it changed
  // so the HTML survives Send / auto-save.
  function insertIntoBody(body, html) {
    body.focus();
    let ok = false;
    try { ok = document.execCommand('insertHTML', false, html); } catch (e) {}
    if (!ok) {
      const sel = window.getSelection();
      let range;
      if (sel.rangeCount && body.contains(sel.anchorNode)) range = sel.getRangeAt(0);
      else { range = document.createRange(); range.selectNodeContents(body); range.collapse(false); }
      range.insertNode(range.createContextualFragment(html));
    }
    body.dispatchEvent(new InputEvent('input', { bubbles: true }));
    body.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── recordings picker ───────────────────────────────────────────────────────
  function onDocDown(e) { const p = document.getElementById('__veorec_pop'); if (p && !p.contains(e.target)) closePicker(); }
  function closePicker() { const p = document.getElementById('__veorec_pop'); if (p) p.remove(); document.removeEventListener('mousedown', onDocDown, true); }

  function openPicker(anchor, body) {
    closePicker();
    const pop = document.createElement('div');
    pop.id = '__veorec_pop';
    pop.style.cssText = 'position:fixed;z-index:2147483647;background:#fff;border:1px solid #e2e4e8;border-radius:12px;box-shadow:0 14px 44px rgba(0,0,0,.24);width:344px;max-height:430px;overflow:auto;font-family:Inter,Arial,sans-serif;';
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 354)) + 'px';
    pop.style.top = Math.max(8, r.top - 440) + 'px';   // float above the send row
    pop.innerHTML =
      `<div style="padding:12px 14px;font-weight:700;font-size:14px;border-bottom:1px solid #eee;color:#111">🎬 Insert a VeoRec video</div>` +
      `<div id="__veorec_list" style="padding:6px;"><div style="padding:20px;text-align:center;color:#888;font-size:13px">Loading your recordings…</div></div>` +
      `<div style="padding:9px 14px;border-top:1px solid #eee;"><a href="${WEB}/dashboard" target="_blank" rel="noopener" style="font-size:12.5px;color:#5b5bf6;text-decoration:none;font-weight:700">＋ Record a new video</a></div>`;
    document.body.appendChild(pop);
    setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);

    chrome.runtime.sendMessage({ type: 'VEOREC_LIST_RECORDINGS' }, (resp) => {
      const list = pop.querySelector('#__veorec_list');
      if (!list) return;
      if (!resp || resp.error) {
        list.innerHTML = (resp && resp.error === 'not_signed_in')
          ? `<div style="padding:18px;font-size:13px;color:#555;line-height:1.5">Open the VeoRec extension and sign in first, then reopen this menu.</div>`
          : `<div style="padding:18px;font-size:13px;color:#b00">Couldn't load your recordings. Try again.</div>`;
        return;
      }
      const recs = (resp.recordings || []).slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 15);
      if (!recs.length) { list.innerHTML = `<div style="padding:18px;font-size:13px;color:#555">No recordings yet — record one first.</div>`; return; }
      list.innerHTML = '';
      recs.forEach((rec) => {
        const row = document.createElement('div');
        row.setAttribute('role', 'button');
        row.style.cssText = 'display:flex;gap:11px;align-items:center;width:100%;cursor:pointer;padding:8px;border-radius:9px;';
        row.onmouseenter = () => (row.style.background = '#f3f4ff');
        row.onmouseleave = () => (row.style.background = 'transparent');
        const src = rec.filename || rec.thumbnail;
        const thumb = src
          ? `<img src="${playThumb(src)}" style="width:90px;height:51px;object-fit:cover;border-radius:6px;flex-shrink:0;background:#222" />`
          : `<div style="width:90px;height:51px;border-radius:6px;background:#222;flex-shrink:0"></div>`;
        row.innerHTML = `${thumb}<span style="font-size:13px;color:#111;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rec.title || 'Untitled')}</span>`;
        row.addEventListener('click', () => { insertIntoBody(body, cardHtml(rec)); closePicker(); });
        list.appendChild(row);
      });
    });
  }

  // ── the button ──────────────────────────────────────────────────────────────
  function buildButton(body) {
    const b = document.createElement('div');
    b.className = 'veorec-btn';
    b.setAttribute('role', 'button');
    b.title = 'Insert a VeoRec video';
    b.style.cssText = 'display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:8px;background:#5b5bf6;color:#fff;font:600 13px Inter,Arial,sans-serif;cursor:pointer;user-select:none;white-space:nowrap;';
    b.innerHTML = '<span style="font-size:14px">🎬</span><span>Video</span>';
    b.addEventListener('mousedown', (e) => e.preventDefault());     // keep the compose body's selection
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPicker(b, body); });
    return b;
  }

  // ── inject into each compose (multiple/inline/pop-out), re-inject on rebuild ──
  const injected = new WeakMap();
  function injectButton(compose, body) {
    const prev = injected.get(compose);
    if (prev && prev.isConnected) return;                            // already has a live button
    const sendBtn = compose.querySelector('div[role="button"][aria-label^="Send"], div[role="button"][data-tooltip^="Send"], .T-I.aoO');
    if (!sendBtn) return;
    const sendCell = sendBtn.closest('td');
    if (!sendCell || !sendCell.parentElement) return;
    if (sendCell.parentElement.querySelector('.veorec-btn')) return; // belt-and-suspenders
    const cell = document.createElement('td');
    cell.style.cssText = 'vertical-align:middle;padding-left:8px;';
    const btn = buildButton(body);
    cell.appendChild(btn);
    sendCell.parentElement.insertBefore(cell, sendCell.nextSibling);
    injected.set(compose, btn);
  }

  function scan() {
    document.querySelectorAll('div[role="textbox"][contenteditable="true"][aria-label]').forEach((body) => {
      const compose = body.closest('div[role="dialog"]') || body.closest('table.iN') || body.closest('.nH.Hd') || body.closest('.iN');
      if (compose) injectButton(compose, body);
    });
  }

  // Gmail rebuilds the toolbar constantly → persistent observer, childList only
  // (attributes:true would infinite-loop), debounced.
  let t;
  const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 60); });
  obs.observe(document.body, { childList: true, subtree: true });
  scan();
})();
