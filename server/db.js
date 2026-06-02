const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'recordings.json');

function load() {
  if (!fs.existsSync(FILE)) return [];
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}

function save(rows) {
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
}

const db = {
  all() { return load(); },

  get(id) { return load().find(r => r.id === id) || null; },

  insert(rec) {
    const rows = load();
    rows.unshift(rec);
    save(rows);
  },

  update(id, fields) {
    const rows = load().map(r => r.id === id ? { ...r, ...fields } : r);
    save(rows);
  },

  delete(id) {
    save(load().filter(r => r.id !== id));
  },
};

module.exports = db;
