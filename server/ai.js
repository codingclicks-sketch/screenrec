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

module.exports = { isLLMConfigured, chat, summarize, extractiveSummary, GROQ_MODEL };
