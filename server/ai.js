// ── Free LLM helper (summaries, chapters, translation) ───────────────────────
// Uses Groq's free tier running the OPEN-SOURCE gpt-oss model — no per-use cost.
// OpenAI-compatible REST, so no SDK/dependency: just fetch. Set GROQ_API_KEY
// (free at console.groq.com) to enable. Without a key, text features fall back to
// transcript-extractive output so nothing hard-fails — it just gets smarter once
// the key is present. This single helper backs summaries, chapters and translate.

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function isLLMConfigured() { return !!GROQ_KEY; }

async function chat(messages, { maxTokens = 700, temperature = 0.3 } = {}) {
  if (!GROQ_KEY) throw Object.assign(new Error('LLM not configured'), { code: 'no_llm' });
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature }),
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return String(j.choices?.[0]?.message?.content || '').trim();
  } finally { clearTimeout(to); }
}

// ── Extractive fallback (no LLM, no key) ──────────────────────────────────────
function extractiveSummary(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 40) return null;
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.split(' ').length >= 4);
  if (!sentences.length) return clean.slice(0, 240);
  // First sentence + the two longest (usually most content-bearing) others.
  const first = sentences[0];
  const rest = sentences.slice(1).sort((a, b) => b.length - a.length).slice(0, 2);
  const picked = [first, ...rest].filter((s, i, a) => a.indexOf(s) === i);
  return picked.join(' ').slice(0, 480);
}

async function summarize(transcriptText) {
  const text = String(transcriptText || '').trim();
  if (text.length < 40) return null;
  if (isLLMConfigured()) {
    try {
      const out = await chat([
        { role: 'system', content: 'You summarize screen-recording transcripts for a video library. Write 2–4 clear sentences in plain language. No preamble, no "this video", no markdown — just the summary.' },
        { role: 'user', content: `Transcript:\n\n${text.slice(0, 12000)}` },
      ], { maxTokens: 300 });
      if (out) return out;
    } catch (e) { /* fall through */ }
  }
  return extractiveSummary(text);
}

// ── Chapters ──────────────────────────────────────────────────────────────────
function titleFromText(text) {
  const words = String(text || '').replace(/[^\w\s']/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  return words.length ? words.join(' ').slice(0, 60) : null;
}
function heuristicChapters(segments, duration) {
  const N = Math.min(6, Math.max(3, Math.round(duration / 120)));
  const step = duration / N;
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = Math.round(i * step);
    const seg = segments.find(s => s.start >= t) || segments[Math.min(i, segments.length - 1)] || segments[0];
    out.push({ t, title: titleFromText(seg && seg.text) || `Part ${i + 1}` });
  }
  return out.filter((c, i, a) => i === 0 || c.t > a[i - 1].t);
}
function safeParseChapters(raw) {
  try {
    const arr = JSON.parse(String(raw || '').replace(/```json|```/g, '').trim());
    if (!Array.isArray(arr)) return [];
    return arr.map(c => ({ t: Math.max(0, Math.round(Number(c.t) || 0)), title: String(c.title || '').slice(0, 80).trim() }))
      .filter(c => c.title).sort((a, b) => a.t - b.t)
      .filter((c, i, a) => i === 0 || c.t !== a[i - 1].t);
  } catch { return []; }
}
async function generateChapters(segments) {
  const arr = (Array.isArray(segments) ? segments : []).filter(s => s && s.text);
  if (arr.length < 3) return [];
  const duration = arr[arr.length - 1].end || arr[arr.length - 1].start || 0;
  if (duration < 60) return [];   // too short to chapter
  if (isLLMConfigured()) {
    try {
      const lines = arr.map(s => `[${Math.round(s.start)}s] ${s.text}`).join('\n').slice(0, 12000);
      const out = await chat([
        { role: 'system', content: 'Split this timestamped video transcript into 3–8 chapters. Reply with ONLY a JSON array of {"t": <seconds int>, "title": "<short title>"}, ordered by time, first at t=0. No prose, no code fences.' },
        { role: 'user', content: lines },
      ], { maxTokens: 500, temperature: 0.2 });
      const parsed = safeParseChapters(out);
      if (parsed.length) { if (parsed[0].t > 0) parsed.unshift({ t: 0, title: 'Intro' }); return parsed.slice(0, 8); }
    } catch (e) { /* fall through */ }
  }
  return heuristicChapters(arr, duration);
}

// ── Translation (LLM-only — no meaningful heuristic fallback) ──────────────────
async function translateSegments(segments, targetLang) {
  const arr = (Array.isArray(segments) ? segments : []).filter(s => s && s.text);
  if (!arr.length) return [];
  if (!isLLMConfigured()) throw Object.assign(new Error('Translation needs the AI key (set GROQ_API_KEY).'), { code: 'no_llm' });
  const numbered = arr.map((s, i) => `${i + 1}. ${s.text}`).join('\n').slice(0, 12000);
  const out = await chat([
    { role: 'system', content: `Translate each numbered line into ${targetLang}. Return the SAME numbered list — one translation per line, same numbers, nothing else.` },
    { role: 'user', content: numbered },
  ], { maxTokens: 2000, temperature: 0.2 });
  const map = {};
  String(out).split('\n').forEach(line => { const m = line.match(/^\s*(\d+)[.)]\s*(.+)$/); if (m) map[+m[1]] = m[2].trim(); });
  return arr.map((s, i) => ({ ...s, text: map[i + 1] || s.text }));
}

module.exports = { isLLMConfigured, chat, summarize, extractiveSummary, generateChapters, translateSegments, GROQ_MODEL };
