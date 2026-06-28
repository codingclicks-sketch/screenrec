// ── Speech-to-text (self-hosted whisper.cpp) ─────────────────────────────────
// 100% free, unlimited, server-side transcription. No external API, no keys,
// no per-use cost — whisper.cpp runs locally on this server. The Docker image
// (see Dockerfile) compiles whisper.cpp and bakes in the ggml model + ffmpeg.
//
// Pipeline per job: download the recording's audio (Cloudinary serves an mp3
// derivative) → ffmpeg to 16 kHz mono WAV (what whisper.cpp wants) → whisper-cli
// with JSON output → parse timestamped segments. Jobs run one-at-a-time through
// a tiny queue so CPU/RAM (and therefore Railway cost) stay predictable.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WHISPER_BIN = process.env.WHISPER_BIN || 'whisper-cli';
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const MODEL_PATH = process.env.WHISPER_MODEL_PATH || path.join(__dirname, 'models', 'ggml-base.bin');
const THREADS = process.env.WHISPER_THREADS || '';      // empty → whisper.cpp default
// Multilingual model → 'auto' lets whisper detect the spoken language per file
// (Urdu, Hindi, Arabic, etc.). For the English-only .en model this is ignored.
const LANGUAGE = process.env.WHISPER_LANGUAGE || (/\.en\.bin$/.test(MODEL_PATH) ? '' : 'auto');

// Available whenever the compiled model is present (i.e. in the built image).
// Lets the dev box (no model) degrade gracefully to a 501 instead of crashing.
function isConfigured() {
  try { return fs.existsSync(MODEL_PATH); } catch { return false; }
}

// Single-slot queue: one transcription at a time. Keeps memory/CPU bursts (and
// cost) bounded and avoids OOM from concurrent jobs.
let chain = Promise.resolve();
function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.then(() => {}, () => {});
  return run;
}

function sh(cmd, args, { timeout } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = timeout ? setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${path.basename(cmd)} timed out`)); }, timeout) : null;
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { if (timer) clearTimeout(timer); reject(e); });
    p.on('close', code => {
      if (timer) clearTimeout(timer);
      code === 0 ? resolve({ out, err }) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-400)}`));
    });
  });
}

async function transcribeSource(srcUrlOrPath) {
  if (!isConfigured()) throw Object.assign(new Error('Transcription is not available on this server'), { code: 'unconfigured' });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'veorec-stt-'));
  const inPath = path.join(tmp, 'input');
  const wavPath = path.join(tmp, 'audio.wav');
  const outPrefix = path.join(tmp, 'out');
  try {
    // 1. Get the source audio bytes.
    if (/^https?:\/\//i.test(srcUrlOrPath)) {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 120_000);
      let r;
      try { r = await fetch(srcUrlOrPath, { signal: ac.signal }); } finally { clearTimeout(to); }
      if (!r.ok) throw new Error(`Could not fetch audio (${r.status})`);
      fs.writeFileSync(inPath, Buffer.from(await r.arrayBuffer()));
    } else {
      fs.copyFileSync(srcUrlOrPath, inPath);
    }

    // 2. Normalise to 16 kHz mono PCM WAV for whisper.cpp.
    await sh(FFMPEG_BIN, ['-nostdin', '-y', '-i', inPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath], { timeout: 120_000 });

    // 3. Transcribe → JSON (writes `${outPrefix}.json`).
    const args = ['-m', MODEL_PATH, '-f', wavPath, '-oj', '-of', outPrefix, '-np'];
    if (THREADS) args.push('-t', String(THREADS));
    if (LANGUAGE) args.push('-l', LANGUAGE);
    await sh(WHISPER_BIN, args, { timeout: 1000 * 60 * 30 });

    // 4. Parse segments (whisper.cpp gives offsets in milliseconds).
    const j = JSON.parse(fs.readFileSync(`${outPrefix}.json`, 'utf8'));
    const segments = (j.transcription || [])
      .map(s => ({
        start: Math.round(((s.offsets?.from ?? 0) / 1000) * 100) / 100,
        end: Math.round(((s.offsets?.to ?? 0) / 1000) * 100) / 100,
        text: String(s.text || '').trim(),
      }))
      .filter(s => s.text);

    return {
      text: segments.map(s => s.text).join(' ').trim(),
      language: j.result?.language || j.params?.language || (MODEL_PATH.includes('.en') ? 'en' : 'auto'),
      segments,
    };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// Same signature the route already uses; accepts a URL or a local file path.
function transcribeUrl(srcUrlOrPath) { return enqueue(() => transcribeSource(srcUrlOrPath)); }

// ── Title generation (100% free, unlimited, self-hosted — no API/LLM) ─────────
// Derives a short, descriptive title from the transcript text using extractive
// heuristics: pick the strongest opening sentence, else fall back to the most
// salient keywords. Owner can always rename afterward.
const STOP = new Set((
  'a an the and or but if then so to of in on at for with as by is are am was were be been being this that these those it its i you he she they we me my your our their him her them us ' +
  'do does did have has had will would can could should may might must not no yes ok okay um uh uhh ah er hmm well like just gonna wanna actually basically literally really very much many some any all one two ' +
  'get got go going goes make made making see seen say said saying know now here there what when where which who whom how why also into out up down over under from about than then once too even more most other another such only ' +
  // common spoken-walkthrough verbs that make poor keywords
  'fill filled fills filling upload uploaded uploads search searched click clicked type typed add added adding put putting open opened use using used show showed shown showing look looked looking want wanted need needed try tried let lets ' +
  'thing things stuff kind sort lot bit way ways guys everyone today right alright hi hey hello welcome video tutorial recording screen ' +
  'going theres im were youre lets dont cant wont thats heres'
).split(/\s+/));

// Filler phrases commonly leading a walkthrough — stripped from the front.
const OPENER_RE = /^(ok(ay)?|so|um|uh|hi|hey|hello|alright|right|welcome|today|now|guys|everyone|let'?s|i'?m going to|i'?m gonna|i will|i'?m|we'?re going to|we will|we'?re|in this (video|tutorial|recording)|first of all|first)\b[ ,]*/i;

function titleCase(s) {
  return s.replace(/\w[\w']*/g, w => /^(of|the|a|an|and|or|to|in|on|at|for|with|by|vs)$/i.test(w)
    ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function generateTitle(text) {
  let clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 8) return null;
  // Peel off leading filler phrases.
  for (let n = 0; n < 4 && OPENER_RE.test(clean); n++) clean = clean.replace(OPENER_RE, '').trim();

  // Significant keywords, kept in order of first appearance, ranked by frequency.
  const tokens = (clean.toLowerCase().match(/[a-z][a-z']{2,}/g) || []).filter(w => !STOP.has(w));
  if (!tokens.length) return null;
  const freq = {}, firstAt = {};
  tokens.forEach((w, idx) => { freq[w] = (freq[w] || 0) + 1; if (firstAt[w] === undefined) firstAt[w] = idx; });
  const ranked = [...new Set(tokens)].sort((a, b) => (freq[b] - freq[a]) || (a.length > 3) - (b.length > 3) || (firstAt[a] - firstAt[b]));
  const keywordTitle = ranked.slice(0, 4).sort((a, b) => firstAt[a] - firstAt[b]).join(' ');

  // Strongest opening sentence (after opener-strip), filler stripped.
  const firstSentence = (clean.split(/(?<=[.!?])\s/)[0] || clean);
  const fsTokens = firstSentence.split(' ').filter(w => /[a-z']/i.test(w));
  let i = 0;
  while (i < fsTokens.length && STOP.has(fsTokens[i].toLowerCase().replace(/[^a-z']/g, ''))) i++;
  const fsTitle = fsTokens.slice(i, i + 9).join(' ').replace(/[\s.,!?;:'"-]+$/, '').trim();
  const fsSignificant = fsTitle.toLowerCase().split(' ').filter(w => !STOP.has(w.replace(/[^a-z']/g, '')) && w.length > 2).length;

  // Prefer a clean opening sentence; otherwise the keyword title.
  let title = (fsSignificant >= 3 && fsTitle.length >= 14 && fsTokens.length - i <= 11) ? fsTitle : keywordTitle;
  title = titleCase(title).slice(0, 70).replace(/[\s,;:-]+$/, '').trim();
  return title || titleCase(keywordTitle) || null;
}

module.exports = { isConfigured, transcribeUrl, generateTitle, MODEL_PATH, WHISPER_BIN };
