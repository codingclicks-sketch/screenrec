// ── Speech-to-text (Whisper) ──────────────────────────────────────────────────
// Provider-agnostic, OpenAI-compatible transcription. Defaults to Groq's hosted
// Whisper (genuinely free tier, very fast). Set WHISPER_API_KEY (a free Groq key
// from https://console.groq.com/keys) to enable; without it the feature degrades
// gracefully and the API returns a clear "not configured" response.
//
// Override the provider with WHISPER_API_URL / WHISPER_MODEL to point at OpenAI
// (https://api.openai.com/v1/audio/transcriptions, model "whisper-1") or any
// other OpenAI-compatible endpoint.

const WHISPER_API_URL = process.env.WHISPER_API_URL || 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_API_KEY = process.env.WHISPER_API_KEY || process.env.GROQ_API_KEY || '';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-large-v3-turbo';
const MAX_BYTES = 24 * 1024 * 1024; // Groq free tier caps uploads at 25MB.

function isConfigured() { return !!WHISPER_API_KEY; }

// Fetch an audio file (e.g. a Cloudinary mp3 derived from the video) and send it
// to the Whisper endpoint. Returns { text, language, segments:[{start,end,text}] }.
async function transcribeUrl(audioUrl) {
  if (!WHISPER_API_KEY) throw Object.assign(new Error('Transcription is not configured'), { code: 'unconfigured' });

  // Download the audio (server → Cloudinary). Allow generous time for Cloudinary
  // to transcode the audio derivative on first request.
  const ac = new AbortController();
  const dlTimer = setTimeout(() => ac.abort(), 120_000);
  let buf;
  try {
    const audioRes = await fetch(audioUrl, { signal: ac.signal });
    if (!audioRes.ok) throw new Error(`Could not fetch audio (${audioRes.status})`);
    buf = Buffer.from(await audioRes.arrayBuffer());
  } finally { clearTimeout(dlTimer); }

  if (!buf || !buf.length) throw new Error('Audio file was empty');
  if (buf.length > MAX_BYTES) {
    throw Object.assign(
      new Error('This recording is too long to transcribe on the free tier (audio over ~25MB). Trim it first or upgrade the Whisper plan.'),
      { code: 'too_large' }
    );
  }

  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'verbose_json'); // includes timestamped segments
  form.append('temperature', '0');

  const ac2 = new AbortController();
  const apiTimer = setTimeout(() => ac2.abort(), 180_000);
  let data;
  try {
    const res = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHISPER_API_KEY}` },
      body: form,
      signal: ac2.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw.slice(0, 300);
      try { msg = JSON.parse(raw).error?.message || msg; } catch {}
      throw new Error(`Transcription failed (${res.status}): ${msg}`);
    }
    data = JSON.parse(raw);
  } finally { clearTimeout(apiTimer); }

  const segments = Array.isArray(data.segments)
    ? data.segments
        .map(s => ({
          start: Math.round((s.start || 0) * 100) / 100,
          end: Math.round((s.end || 0) * 100) / 100,
          text: String(s.text || '').trim(),
        }))
        .filter(s => s.text)
    : [];

  return {
    text: (data.text || segments.map(s => s.text).join(' ')).trim(),
    language: data.language || 'en',
    segments,
  };
}

module.exports = { isConfigured, transcribeUrl, WHISPER_MODEL, WHISPER_API_URL };
