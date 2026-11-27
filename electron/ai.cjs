// Ask AI: which AI services Mwanga can use, and how to talk to each of them.
// Kept free of Electron so the tests can run it in plain Node.
// Every service gets the same short job: words someone remembers in, Bible references out.
// Mwanga never shows the AI's words on screen; it checks each reference against its own Bible.

const PROVIDERS = {
  anthropic: {
    name: 'Claude (Anthropic)', style: 'anthropic', base: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-5-5', prefer: [/haiku/i], keyUrl: 'https://console.anthropic.com/settings/keys'
  },
  openai: {
    name: 'ChatGPT (OpenAI)', style: 'openai', base: 'https://api.openai.com/v1',
    model: 'gpt-6-luna', prefer: [/luna/i, /nano/i, /mini/i], keyUrl: 'https://platform.openai.com/api-keys'
  },
  gemini: {
    // gemini-3.5-flash is on Google's free tier (not every Gemini model is)
    name: 'Gemini (Google) · free tier', style: 'compat', base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash', prefer: [/^gemini-3\.5-flash$/i, /^gemini-3\.1-flash-lite$/i, /^gemini-2\.5-flash$/i], keyUrl: 'https://aistudio.google.com/apikey'
  },
  groq: {
    name: 'Groq · free tier', style: 'compat', base: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b', prefer: [/gpt-oss-120b/i, /llama-3\.3-70b/i], keyUrl: 'https://console.groq.com/keys'
  },
  // OpenRouter, Groq, DeepSeek, Mistral… or a model running on this computer with Ollama or LM Studio
  custom: { name: 'Other (OpenAI-compatible)', style: 'compat', base: '', model: '', prefer: [], keyUrl: '', keyOptional: true }
};

const SYSTEM = 'You identify Bible verses. The user types what they remember of a Bible verse: some of its words, a paraphrase, or a description of what it says, in English or Swahili. Reply with only a JSON array of up to 5 references, best first, written as "Book Chapter:Verse" or "Book Chapter:Verse-Verse" with English book names, for example ["Jeremiah 29:11", "Romans 8:28"]. If nothing fits, reply [].';

const providerList = () => Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, model: p.model, keyUrl: p.keyUrl, keyOptional: !!p.keyOptional, needsUrl: !p.base }));

// a web address someone typed for "Other": keep http(s) only, without a trailing slash or /chat/completions
function cleanBase(url) {
  let u = String(url || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  if (!u) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && !/^https?:\/\//i.test(u)) return ''; // only web addresses
  if (!/^https?:\/\//i.test(u)) u = (/^(localhost|127\.|\[::1\])/i.test(u) ? 'http://' : 'https://') + u;
  try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? u : ''; } catch (_) { return ''; }
}

function resolve(cfg) {
  const c = cfg || {};
  const id = PROVIDERS[c.provider] ? c.provider : 'anthropic';
  const p = PROVIDERS[id];
  const base = (process.env.MWANGA_AI_BASE ? process.env.MWANGA_AI_BASE.replace(/\/+$/, '') : '') || (id === 'custom' ? cleanBase(c.baseUrl) : p.base);
  return { id, p, base, model: String(c.model || '').trim() || p.model };
}

function headers(style, key) {
  const h = { 'content-type': 'application/json' };
  if (style === 'anthropic') { h['x-api-key'] = key; h['anthropic-version'] = '2023-06-01'; } else if (key) h.authorization = `Bearer ${key}`;
  return h;
}

// the request that asks for verses: { url, init }
function verseRequest(cfg, key, query) {
  const { p, base, model } = resolve(cfg);
  const q = String(query || '').slice(0, 400);
  if (p.style === 'anthropic') {
    return { url: `${base}/messages`, init: { method: 'POST', headers: headers('anthropic', key), body: JSON.stringify({ model, max_tokens: 200, system: SYSTEM, messages: [{ role: 'user', content: q }] }) } };
  }
  const body = { model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: q }] };
  // OpenAI's newer models think before answering and count that against this limit, so it is generous; it still costs a fraction of a cent
  if (p.style === 'openai') body.max_completion_tokens = 2000; else body.max_tokens = 2000;
  return { url: `${base}/chat/completions`, init: { method: 'POST', headers: headers(p.style, key), body: JSON.stringify(body) } };
}

function modelsRequest(cfg, key) {
  const { p, base } = resolve(cfg);
  return { url: `${base}/models${p.style === 'anthropic' ? '?limit=100' : ''}`, init: { method: 'GET', headers: headers(p.style, key) } };
}

// the text of the answer, whichever service it came from
function answerText(data) {
  if (!data || typeof data !== 'object') return '';
  if (Array.isArray(data.content)) return data.content.map((c) => (c && c.text) || '').join('');
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map((c) => (c && c.text) || '').join('');
  return '';
}

// the first JSON list of references in the answer; a model's thinking (<think>…</think>) and ``` fences are skipped
function parseRefs(text) {
  const t = String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, ' ').replace(/```(json)?/gi, ' ');
  const lists = t.match(/\[[^[\]]*\]/g) || [];
  for (const l of lists) {
    try {
      const v = JSON.parse(l);
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.map((x) => x.trim()).filter(Boolean).slice(0, 5);
    } catch (_) { /* not JSON: try the next one */ }
  }
  return [];
}

// what went wrong, in words the operator screen can explain
function errorKind(status, bodyText) {
  const b = String(bodyText || '').toLowerCase();
  if (status === 401 || status === 403) return /credit|billing|quota|balance/.test(b) ? 'quota' : 'badkey';
  if (status === 402 || status === 429) return 'quota';
  if (/credit balance|insufficient|quota|billing/.test(b)) return 'quota';
  if (status === 404 || (/model/.test(b) && (status === 400 || status === 422))) return 'badmodel';
  if (/api key|api_key|invalid.*key/.test(b)) return 'badkey';
  return 'http';
}

// the model list a service returns, with chat models only, the suggested one first
const NOT_CHAT = /embed|whisper|tts|guard|orpheus|playai|transcri|dall-e|image|audio|realtime|moderation|search|babbage|davinci|sora|speech|veo|imagen|aqa|computer-use|codex/i;
function modelList(id, data) {
  const p = PROVIDERS[id] || PROVIDERS.custom;
  const ids = ((data && (data.data || data.models)) || []).map((m) => String((m && (m.id || m.name)) || '').replace(/^models\//, '')).filter(Boolean);
  const chat = [...new Set(ids.filter((m) => !NOT_CHAT.test(m)))];
  return { models: chat.sort(), suggested: suggest(p, chat) };
}
function suggest(p, models) {
  if (models.includes(p.model)) return p.model;
  for (const re of p.prefer) { const hit = models.filter((m) => re.test(m)).sort().reverse()[0]; if (hit) return hit; }
  return models[0] || p.model;
}

module.exports = { PROVIDERS, SYSTEM, providerList, cleanBase, resolve, verseRequest, modelsRequest, answerText, parseRefs, errorKind, modelList };
