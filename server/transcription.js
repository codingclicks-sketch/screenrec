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
const MODEL_PATH = process.env.WHISPER_MODEL_PATH || path.join(__dirname, 'models', 'ggml-base.en.bin');
const THREADS = process.env.WHISPER_THREADS || '';      // empty → whisper.cpp default
const LANGUAGE = process.env.WHISPER_LANGUAGE || '';     // e.g. 'auto' for multilingual models

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

module.exports = { isConfigured, transcribeUrl, MODEL_PATH, WHISPER_BIN };
