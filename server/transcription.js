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

// ── Groq hosted Whisper (PREFERRED) ──────────────────────────────────────────
// When GROQ_API_KEY is set we transcribe with Groq's real whisper-large-v3 — SOTA
// multilingual, strong on Urdu/Hindi — instead of the tiny self-hosted ggml-base
// model (whose garbled/repeated Urdu was the root problem). Free tier covers early
// usage; falls back to local whisper-cli only when no key is present.
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3';   // NOT turbo — accuracy wins for Urdu
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MAX_BYTES = 24 * 1024 * 1024;   // stay under the 25 MB free-tier cap
const CHUNK_SECONDS = 600;                  // 10-min chunks when a recording exceeds the cap

// Available when Groq is keyed OR the local model is present (dev box → 501).
function isConfigured() {
  if (GROQ_API_KEY) return true;
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

// ── Groq path: re-encode → (chunk if needed) → whisper-large-v3 → segments ────
async function groqTranscribeFile(filePath, fileName) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();                       // Node 18+ global
  form.append('file', new Blob([buf]), fileName);    // filename drives Groq's format sniffing
  form.append('model', GROQ_STT_MODEL);
  form.append('response_format', 'verbose_json');    // REQUIRED for timestamped segments
  form.append('temperature', '0');                   // deterministic → avoids repeated-line hallucination
  // NO 'language' field → auto-detect (so English recordings still transcribe correctly)
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 180_000);
  let r;
  try {
    r = await fetch(GROQ_STT_URL, { method: 'POST', headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, body: form, signal: ac.signal });
  } finally { clearTimeout(to); }
  if (r.status === 429) throw Object.assign(new Error('Transcription is busy right now — please try again shortly.'), { code: 'rate_limited' });
  if (!r.ok) throw new Error(`Groq STT ${r.status}: ${(await r.text()).slice(-300)}`);
  return r.json();
}

// verbose_json → VeoRec {text, language, segments:[{start,end,text}]} (Groq is already in SECONDS).
function mapGroqJson(j, offsetSec = 0) {
  const segments = (j.segments || [])
    // Whisper's own silence/low-confidence signature — drops the garbage repeated
    // lines the tiny base model produced.
    .filter(s => !((s.no_speech_prob > 0.6) && (s.avg_logprob < -1)))
    .map(s => ({
      start: Math.round(((s.start || 0) + offsetSec) * 100) / 100,
      end: Math.round(((s.end || 0) + offsetSec) * 100) / 100,
      text: String(s.text || '').trim(),
    }))
    .filter(s => s.text);
  return { text: segments.map(s => s.text).join(' ').trim(), language: j.language || 'auto', segments };
}

async function transcribeViaGroq(inPath, tmp) {
  // 16 kHz mono mp3 (~0.5 MB/min) so files stay well under the 25 MB cap.
  const mp3Path = path.join(tmp, 'audio.mp3');
  await sh(FFMPEG_BIN, ['-nostdin', '-y', '-i', inPath, '-ar', '16000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', mp3Path], { timeout: 120_000 });
  if (fs.statSync(mp3Path).size <= GROQ_MAX_BYTES) {
    return mapGroqJson(await groqTranscribeFile(mp3Path, 'audio.mp3'));
  }
  // Over the cap → split into fixed CHUNK_SECONDS pieces; merge with a time offset.
  const pat = path.join(tmp, 'chunk_%03d.mp3');
  await sh(FFMPEG_BIN, ['-nostdin', '-y', '-i', mp3Path, '-f', 'segment', '-segment_time', String(CHUNK_SECONDS), '-ar', '16000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', pat], { timeout: 300_000 });
  const chunks = fs.readdirSync(tmp).filter(f => /^chunk_\d+\.mp3$/.test(f)).sort();
  let allSegs = [], lang = 'auto';
  for (let i = 0; i < chunks.length; i++) {
    const j = await groqTranscribeFile(path.join(tmp, chunks[i]), chunks[i]);
    if (i === 0) lang = j.language || 'auto';
    allSegs = allSegs.concat(mapGroqJson(j, i * CHUNK_SECONDS).segments);   // fixed-width offset = i * T
  }
  return { text: allSegs.map(s => s.text).join(' ').trim(), language: lang, segments: allSegs };
}

// ── Local whisper.cpp path (fallback when no Groq key) ───────────────────────
async function transcribeViaWhisperCli(inPath, tmp) {
  const wavPath = path.join(tmp, 'audio.wav');
  const outPrefix = path.join(tmp, 'out');
  await sh(FFMPEG_BIN, ['-nostdin', '-y', '-i', inPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath], { timeout: 120_000 });
  const args = ['-m', MODEL_PATH, '-f', wavPath, '-oj', '-of', outPrefix, '-np'];
  if (THREADS) args.push('-t', String(THREADS));
  if (LANGUAGE) args.push('-l', LANGUAGE);
  await sh(WHISPER_BIN, args, { timeout: 1000 * 60 * 30 });
  const j = JSON.parse(fs.readFileSync(`${outPrefix}.json`, 'utf8'));
  const segments = (j.transcription || [])
    .map(s => ({
      start: Math.round(((s.offsets?.from ?? 0) / 1000) * 100) / 100,   // whisper.cpp gives ms → s
      end: Math.round(((s.offsets?.to ?? 0) / 1000) * 100) / 100,
      text: String(s.text || '').trim(),
    }))
    .filter(s => s.text);
  return {
    text: segments.map(s => s.text).join(' ').trim(),
    language: j.result?.language || j.params?.language || (MODEL_PATH.includes('.en') ? 'en' : 'auto'),
    segments,
  };
}

async function transcribeSource(srcUrlOrPath) {
  if (!isConfigured()) throw Object.assign(new Error('Transcription is not available on this server'), { code: 'unconfigured' });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'veorec-stt-'));
  const inPath = path.join(tmp, 'input');
  try {
    // 1. Get the source audio bytes (Cloudinary mp3 derivative or a local file).
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

    // 2. Prefer Groq's whisper-large-v3 when keyed; else local whisper.cpp.
    if (GROQ_API_KEY) return await transcribeViaGroq(inPath, tmp);
    return await transcribeViaWhisperCli(inPath, tmp);
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
