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
const FFPROBE_BIN = process.env.FFPROBE_BIN || 'ffprobe';

// ── Code-switch (multi-language) config — silence-VAD chunking ────────────────
// A single Whisper call auto-detects ONE language from the first 30s window and
// locks the WHOLE file to it (Urdu spoken after an English open → mis-transcribed
// as English). Fix: split on natural pauses and transcribe each utterance with its
// OWN independent auto-detect, then merge — so English stays English, Urdu stays Urdu.
const VAD_NOISE = process.env.STT_VAD_NOISE || '-30dB';            // silence threshold (looser than ffmpeg's -60dB default)
const VAD_MIN_SIL = Number(process.env.STT_VAD_MIN_SIL || 0.5);    // min silence (s) to count as a pause
const CHUNK_MAX_SEC = Number(process.env.STT_CHUNK_MAX || 40);     // hard cap so no chunk exceeds Whisper's window
const CHUNK_MIN_SEC = Number(process.env.STT_CHUNK_MIN || 3);      // merge short chunks (short snippets mis-detect language)
const DOMINANT_MIN_SHARE = Number(process.env.STT_DOMINANT_SHARE || 0.15); // a language must cover ≥ this share of audio to be kept
const CHUNK_PAD_SEC = 0.15;                                        // pad into surrounding silence so boundary words aren't clipped
const MAX_CHUNKS = Number(process.env.STT_MAX_CHUNKS || 40);       // rate-limit safety: never exceed this many Groq calls
const CHUNK_GAP_MS = Number(process.env.STT_CHUNK_GAP_MS || 3100); // ≥3s spacing → stays under Groq's 20 RPM

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

// ── Groq path: VAD-chunk → per-chunk AUTO-DETECT → merge (true multi-language) ─
// Each chunk auto-detects its OWN language (no `language` param). That is the whole
// point: an Urdu utterance detects 'ur', an English one detects 'en'.
async function groqTranscribeFile(filePath, fileName, language) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();                       // Node 18+ global
  form.append('file', new Blob([buf]), fileName);    // filename drives Groq's format sniffing
  form.append('model', GROQ_STT_MODEL);
  form.append('response_format', 'verbose_json');    // REQUIRED for timestamped segments
  form.append('temperature', '0');                   // deterministic → avoids repeated-line hallucination
  form.append('timestamp_granularities[]', 'segment');
  if (language) form.append('language', language);   // pass 2 only: force the dominant language on a mis-detected chunk
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
    // Whisper's own silence/low-confidence signature — drops garbage repeated lines.
    .filter(s => !((s.no_speech_prob > 0.6) && (s.avg_logprob < -1)))
    .map(s => ({
      start: Math.round(((s.start || 0) + offsetSec) * 100) / 100,
      end: Math.round(((s.end || 0) + offsetSec) * 100) / 100,
      text: String(s.text || '').trim(),
    }))
    .filter(s => s.text);
  return { text: segments.map(s => s.text).join(' ').trim(), language: j.language || 'auto', segments };
}

// ffprobe → media duration in seconds (0 if unreadable).
async function probeDuration(filePath) {
  try {
    const { out } = await sh(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath], { timeout: 30_000 });
    const d = parseFloat(String(out).trim());
    return Number.isFinite(d) ? d : 0;
  } catch { return 0; }
}

// ffmpeg silencedetect (logs to STDERR) → array of {start,end} silence intervals.
async function detectSilences(filePath) {
  let err = '';
  try {
    const res = await sh(FFMPEG_BIN, ['-hide_banner', '-nostats', '-nostdin', '-i', filePath, '-af', `silencedetect=noise=${VAD_NOISE}:d=${VAD_MIN_SIL}`, '-f', 'null', '-'], { timeout: 180_000 });
    err = res.err;
  } catch (e) { err = String(e && e.message || ''); }   // defensive — parse whatever we captured
  const sils = [];
  const re = /silence_start:\s*([\d.]+)|silence_end:\s*([\d.]+)/g;
  let m, cur = null;
  while ((m = re.exec(err))) {
    if (m[1] !== undefined) cur = { start: parseFloat(m[1]), end: null };
    else if (m[2] !== undefined && cur) { cur.end = parseFloat(m[2]); sils.push(cur); cur = null; }
  }
  return sils;
}

// Invert silences → speech chunks; pad into silence; merge slivers; cap length.
function buildSpeechChunks(silences, duration) {
  if (!duration || duration <= 0) return [];
  let chunks = [], cursor = 0;
  for (const s of silences) {
    if (s.start > cursor) chunks.push({ start: cursor, end: Math.min(s.start, duration) });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < duration) chunks.push({ start: cursor, end: duration });
  chunks = chunks.map(c => ({ start: Math.max(0, c.start - CHUNK_PAD_SEC), end: Math.min(duration, c.end + CHUNK_PAD_SEC) }));
  const merged = [];
  for (const c of chunks) {
    const prev = merged[merged.length - 1];
    if (prev && (c.end - c.start < CHUNK_MIN_SEC)) prev.end = c.end;   // fold a sliver into the previous chunk
    else merged.push({ ...c });
  }
  const capped = [];
  for (const c of merged) {
    let s = c.start;
    while (c.end - s > CHUNK_MAX_SEC) { capped.push({ start: s, end: s + CHUNK_MAX_SEC }); s += CHUNK_MAX_SEC; }
    if (c.end - s > 0.05) capped.push({ start: s, end: c.end });
  }
  return capped;
}

// Whisper returns the language as a lowercase NAME; map → ISO code so we can FORCE
// the dominant language on a mis-detected chunk (pass 2). Covers the languages that
// realistically dominate a recording.
const WHISPER_NAME_TO_CODE = {
  english: 'en', urdu: 'ur', hindi: 'hi', arabic: 'ar', persian: 'fa', farsi: 'fa',
  chinese: 'zh', mandarin: 'zh', cantonese: 'yue', spanish: 'es', castilian: 'es',
  french: 'fr', german: 'de', japanese: 'ja', korean: 'ko', portuguese: 'pt',
  russian: 'ru', italian: 'it', turkish: 'tr', dutch: 'nl', flemish: 'nl', polish: 'pl',
  indonesian: 'id', malay: 'ms', ukrainian: 'uk', hebrew: 'he', greek: 'el',
  czech: 'cs', romanian: 'ro', moldovan: 'ro', danish: 'da', hungarian: 'hu',
  tamil: 'ta', norwegian: 'no', nynorsk: 'nn', thai: 'th', vietnamese: 'vi',
  bengali: 'bn', telugu: 'te', marathi: 'mr', gujarati: 'gu', kannada: 'kn',
  malayalam: 'ml', punjabi: 'pa', panjabi: 'pa', swahili: 'sw', pashto: 'ps', pushto: 'ps',
  nepali: 'ne', sinhala: 'si', sinhalese: 'si', swedish: 'sv', finnish: 'fi',
  catalan: 'ca', valencian: 'ca', serbian: 'sr', croatian: 'hr', bulgarian: 'bg',
  slovak: 'sk', hausa: 'ha', amharic: 'am', somali: 'so', azerbaijani: 'az',
  kazakh: 'kk', uzbek: 'uz', sindhi: 'sd', tagalog: 'tl',
};

async function transcribeViaGroq(inPath, tmp) {
  // 16 kHz mono WAV — Whisper's native rate; used for silence analysis + chunk cuts.
  const wavPath = path.join(tmp, 'audio.wav');
  await sh(FFMPEG_BIN, ['-nostdin', '-y', '-i', inPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath], { timeout: 120_000 });

  const duration = await probeDuration(wavPath);
  const silences = await detectSilences(wavPath);
  let chunks = buildSpeechChunks(silences, duration);

  // FALLBACK: no usable pauses (continuous speech / very short clip / unknown
  // duration) → single whole-file auto-detect call (best a single model can do).
  if (!chunks.length || (chunks.length === 1 && (!duration || chunks[0].end - chunks[0].start >= duration - 0.5))) {
    const mp3Path = path.join(tmp, 'whole.mp3');
    await sh(FFMPEG_BIN, ['-nostdin', '-y', '-i', wavPath, '-c:a', 'libmp3lame', '-b:a', '64k', mp3Path], { timeout: 120_000 });
    return mapGroqJson(await groqTranscribeFile(mp3Path, 'audio.mp3'));
  }

  // Rate-limit safety: if VAD over-split, pairwise-merge until ≤ MAX_CHUNKS calls.
  while (chunks.length > MAX_CHUNKS) {
    const merged = [];
    for (let i = 0; i < chunks.length; i += 2) { const a = chunks[i], b = chunks[i + 1]; merged.push(b ? { start: a.start, end: b.end } : a); }
    chunks = merged;
  }

  // ── Pass 1: transcribe each chunk with independent auto-detect ────────────────
  const results = [], langDur = {};                   // results: {chunk, flac, lang, segments}
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const flac = path.join(tmp, `chunk_${String(i).padStart(3, '0')}.flac`);
    await sh(FFMPEG_BIN, ['-nostdin', '-y', '-ss', String(c.start), '-to', String(c.end), '-i', wavPath, '-ac', '1', '-ar', '16000', '-c:a', 'flac', flac], { timeout: 60_000 });
    let j;
    try { j = await groqTranscribeFile(flac, `chunk_${i}.flac`); }
    catch (e) {                                       // one retry after a backoff, then skip this chunk (keep the rest)
      await new Promise(r => setTimeout(r, CHUNK_GAP_MS * 2));
      try { j = await groqTranscribeFile(flac, `chunk_${i}.flac`); }
      catch (e2) { console.error(`[transcribe] chunk ${i} skipped:`, e2.message); continue; }
    }
    const lang = String(j.language || 'auto').toLowerCase();
    langDur[lang] = (langDur[lang] || 0) + (c.end - c.start);
    results.push({ chunk: c, flac, lang, segments: mapGroqJson(j, c.start).segments });
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, CHUNK_GAP_MS));              // pace under 20 RPM
  }

  // ── Pass 2: suppress spurious languages ───────────────────────────────────────
  // Short/noisy chunks mis-detect into random languages (e.g. Korean/Arabic creeping
  // into an Urdu video). Keep only languages that cover a real share of the audio;
  // re-transcribe the rest FORCED to the dominant language so the script/text is right.
  const totalDur = Object.values(langDur).reduce((a, b) => a + b, 0) || 1;
  const dominant = Object.keys(langDur).sort((a, b) => langDur[b] - langDur[a])[0] || 'auto';
  const legit = new Set(Object.keys(langDur).filter(l => langDur[l] >= DOMINANT_MIN_SHARE * totalDur));
  legit.add(dominant);
  const domCode = WHISPER_NAME_TO_CODE[dominant];
  if (domCode) {
    for (const r of results) {
      if (legit.has(r.lang)) continue;
      try {
        const j = await groqTranscribeFile(r.flac, 'rechunk.flac', domCode);   // force the dominant language
        r.segments = mapGroqJson(j, r.chunk.start).segments;
        r.lang = dominant;
        await new Promise(rs => setTimeout(rs, CHUNK_GAP_MS));
      } catch (e) { /* keep the pass-1 result on failure */ }
    }
  }

  // ── Merge (absolute offsets already applied per chunk) ────────────────────────
  const allSegs = [];
  for (const r of results) for (const s of r.segments) allSegs.push({ ...s, language: r.lang });
  allSegs.sort((a, b) => a.start - b.start);
  return { text: allSegs.map(s => s.text).join(' ').trim(), language: dominant, segments: allSegs };
}

// ── Local whisper.cpp path (fallback when no Groq key) ───────────────────────
async function transcribeViaWhisperCli(inPath, tmp, language) {
  const wavPath = path.join(tmp, 'audio.wav');
  const outPrefix = path.join(tmp, 'out');
  await sh(FFMPEG_BIN, ['-nostdin', '-y', '-i', inPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath], { timeout: 120_000 });
  const args = ['-m', MODEL_PATH, '-f', wavPath, '-oj', '-of', outPrefix, '-np'];
  if (THREADS) args.push('-t', String(THREADS));
  const forceLang = (language && language !== 'auto') ? language : LANGUAGE;
  if (forceLang) args.push('-l', forceLang);
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

async function transcribeSource(srcUrlOrPath, language) {
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

    // 2. Prefer Groq's whisper-large-v3 (multi-language VAD pipeline — `language`
    //    is intentionally ignored: one behaviour = native mixed "Original"); else
    //    local whisper.cpp (still honours `language` as a fallback).
    if (GROQ_API_KEY) return await transcribeViaGroq(inPath, tmp);
    return await transcribeViaWhisperCli(inPath, tmp, language);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// Accepts a URL or local file path; `language` (ISO-639-1, e.g. 'ur') forces the
// spoken language, or 'auto'/undefined to auto-detect.
function transcribeUrl(srcUrlOrPath, language) { return enqueue(() => transcribeSource(srcUrlOrPath, language)); }

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
