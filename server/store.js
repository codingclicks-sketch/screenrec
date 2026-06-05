// Tiny JSON-file store factory — same persistence model as users.js / meta.js.
// Everything lives on DATA_DIR (Railway volume) so it survives redeploys.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Create a keyed object-store backed by a JSON file.
 * Shape on disk: { [id]: record }.
 */
function createKeyedStore(filename) {
  const FILE = path.join(DATA_DIR, filename);
  const read = () => {
    if (!fs.existsSync(FILE)) return {};
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
  };
  const write = (data) => fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

  return {
    all() { return Object.values(read()); },
    raw() { return read(); },
    get(id) { return read()[id] || null; },
    set(id, record) {
      const all = read();
      all[id] = { ...(all[id] || {}), ...record };
      write(all);
      return all[id];
    },
    update(id, fn) {
      const all = read();
      const next = fn(all[id] || null);
      if (next == null) return null;
      all[id] = next;
      write(all);
      return all[id];
    },
    remove(id) {
      const all = read();
      delete all[id];
      write(all);
    },
    find(predicate) { return Object.values(read()).find(predicate) || null; },
    filter(predicate) { return Object.values(read()).filter(predicate); },
  };
}

/** Create an append-only log store backed by a JSON array file. */
function createLogStore(filename) {
  const FILE = path.join(DATA_DIR, filename);
  const read = () => {
    if (!fs.existsSync(FILE)) return [];
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
  };
  const write = (data) => fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  return {
    all() { return read(); },
    append(entry) {
      const rows = read();
      rows.push(entry);
      // keep file bounded — last 50k events is plenty for this scale
      write(rows.length > 50000 ? rows.slice(-50000) : rows);
      return entry;
    },
    filter(predicate) { return read().filter(predicate); },
  };
}

module.exports = { createKeyedStore, createLogStore, DATA_DIR };
