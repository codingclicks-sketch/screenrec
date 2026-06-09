const fs = require('fs');
const path = require('path');

// Stored on the persistent volume so engagement/sharing data survives redeploys.
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const META_FILE = path.join(DATA_DIR, 'meta.json');
const FOLDER_FILE = path.join(DATA_DIR, 'folders.json');

function loadJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ── Per-recording metadata (engagement + sharing settings) ────────────────────
function defaults() {
  return {
    views: 0,
    viewers: [],          // [{ name, at }]
    reactions: [],        // [{ emoji, t, at }]  — t = seconds into the video
    comments: [],         // [{ id, name, text, at, t }]
    cta: null,            // { label, url }
    description: '',
    privacy: 'public',    // 'public' | 'login' | 'password'
    passwordHash: null,
    folder: null,         // folderId
    trimStart: null,      // seconds — virtual trim (player only plays start..end)
    trimEnd: null,
    segments: null,       // [{start,end}] keep-ranges (virtual split); null = whole video
    transcript: null,     // { status, language, text, segments:[{start,end,text}], created_at }
  };
}

const meta = {
  get(id) {
    const all = loadJSON(META_FILE, {});
    return { ...defaults(), ...(all[id] || {}) };
  },
  set(id, fields) {
    const all = loadJSON(META_FILE, {});
    all[id] = { ...defaults(), ...(all[id] || {}), ...fields };
    saveJSON(META_FILE, all);
    return all[id];
  },
  // atomic-ish mutation helper
  update(id, fn) {
    const all = loadJSON(META_FILE, {});
    const cur = { ...defaults(), ...(all[id] || {}) };
    all[id] = fn(cur) || cur;
    saveJSON(META_FILE, all);
    return all[id];
  },
  remove(id) {
    const all = loadJSON(META_FILE, {});
    delete all[id];
    saveJSON(META_FILE, all);
  },
};

// ── Folders (per user) ────────────────────────────────────────────────────────
const folders = {
  listByUser(userId) {
    return loadJSON(FOLDER_FILE, []).filter(f => f.userId === userId);
  },
  create(folder) {
    const all = loadJSON(FOLDER_FILE, []);
    all.push(folder);
    saveJSON(FOLDER_FILE, all);
    return folder;
  },
  get(id) {
    return loadJSON(FOLDER_FILE, []).find(f => f.id === id) || null;
  },
  update(id, userId, fields) {
    const all = loadJSON(FOLDER_FILE, []);
    const i = all.findIndex(f => f.id === id && f.userId === userId);
    if (i === -1) return null;
    all[i] = { ...all[i], ...fields };
    saveJSON(FOLDER_FILE, all);
    return all[i];
  },
  remove(id, userId) {
    let all = loadJSON(FOLDER_FILE, []);
    all = all.filter(f => !(f.id === id && f.userId === userId));
    saveJSON(FOLDER_FILE, all);
  },
};

module.exports = { meta, folders };
