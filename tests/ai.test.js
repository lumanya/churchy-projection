import { describe, it, expect, afterEach } from 'vitest';
import AI from '../electron/ai.cjs';
import { aiConfig, aiReady, withAiModel } from '../src/lib/aiConfig.js';

const body = (r) => JSON.parse(r.init.body);

describe('Ask AI services', () => {
  afterEach(() => { delete process.env.MWANGA_AI_BASE; });

  it('asks Claude in the Anthropic format', () => {
    const r = AI.verseRequest({ provider: 'anthropic' }, 'sk-ant', 'plans to prosper you');
    expect(r.url).toBe('https://api.anthropic.com/v1/messages');
    expect(r.init.headers['x-api-key']).toBe('sk-ant');
    expect(r.init.headers.authorization).toBeUndefined();
    expect(body(r).model).toBe('claude-haiku-5-5');
    expect(body(r).system).toBe(AI.SYSTEM);
    expect(body(r).messages).toEqual([{ role: 'user', content: 'plans to prosper you' }]);
  });

  it('asks ChatGPT in the OpenAI format with room for its thinking', () => {
    const r = AI.verseRequest({ provider: 'openai', model: 'gpt-6-luna' }, 'sk-proj', 'the lord is my shepherd');
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(r.init.headers.authorization).toBe('Bearer sk-proj');
    expect(r.init.headers['x-api-key']).toBeUndefined();
    const b = body(r);
    expect(b.messages[0]).toEqual({ role: 'system', content: AI.SYSTEM });
    expect(b.max_completion_tokens).toBeGreaterThanOrEqual(1000);
    expect(b.max_tokens).toBeUndefined();
  });

  it('asks Gemini through its OpenAI-compatible address', () => {
    const r = AI.verseRequest({ provider: 'gemini' }, 'AIza', 'x');
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(body(r).max_tokens).toBeGreaterThan(0);
    expect(body(r).model).toBe('gemini-3.5-flash');
    expect(body(r).reasoning_effort).toBe('low'); // short thinking, so it answers in seconds
    expect(body(AI.verseRequest({ provider: 'openai' }, 'k', 'x')).reasoning_effort).toBeUndefined();
    expect(body(AI.verseRequest({ provider: 'groq', model: 'llama-3.3-70b-versatile' }, 'k', 'x')).reasoning_effort).toBeUndefined();
  });

  it('asks Groq at its OpenAI-compatible address', () => {
    const r = AI.verseRequest({ provider: 'groq' }, 'gsk_1', 'x');
    expect(r.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(r.init.headers.authorization).toBe('Bearer gsk_1');
    expect(body(r).model).toBe('openai/gpt-oss-120b');
  });

  it('uses the address typed for another service, with or without a key', () => {
    const r = AI.verseRequest({ provider: 'custom', baseUrl: 'localhost:11434/v1/', model: 'llama3.2' }, '', 'x');
    expect(r.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(r.init.headers.authorization).toBeUndefined();
    expect(body(r).model).toBe('llama3.2');
    expect(AI.cleanBase('https://openrouter.ai/api/v1/chat/completions')).toBe('https://openrouter.ai/api/v1');
    expect(AI.cleanBase('openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1');
    expect(AI.cleanBase('file:///etc/passwd')).toBe('');
    expect(AI.resolve({ provider: 'custom', baseUrl: '' }).base).toBe('');
  });

  it('falls back to Claude for an unknown service name', () => {
    expect(AI.resolve({ provider: 'nope' }).id).toBe('anthropic');
  });

  it('reads the answer from either format', () => {
    expect(AI.answerText({ content: [{ type: 'text', text: '["John 3:16"]' }] })).toBe('["John 3:16"]');
    expect(AI.answerText({ choices: [{ message: { content: '["Psalm 23:1"]' } }] })).toBe('["Psalm 23:1"]');
    expect(AI.answerText({ choices: [{ message: { content: [{ type: 'text', text: '[]' }] } }] })).toBe('[]');
    expect(AI.answerText(null)).toBe('');
  });

  it('finds the list of references even with thinking or code fences around it', () => {
    expect(AI.parseRefs('Here: ["Jeremiah 29:11", "Romans 8:28"]')).toEqual(['Jeremiah 29:11', 'Romans 8:28']);
    expect(AI.parseRefs('<think>maybe [1, 2] or [Isaiah]</think>\n```json\n["Isaiah 40:31"]\n```')).toEqual(['Isaiah 40:31']);
    expect(AI.parseRefs('no idea')).toEqual([]);
    expect(AI.parseRefs('[]')).toEqual([]);
    expect(AI.parseRefs('["a","b","c","d","e","f","g"]')).toHaveLength(5);
  });

  it('explains what went wrong', () => {
    expect(AI.errorKind(401, '')).toBe('badkey');
    expect(AI.errorKind(429, '{"error":{"code":"insufficient_quota"}}')).toBe('quota');
    expect(AI.errorKind(400, 'Your credit balance is too low to access the Anthropic API')).toBe('quota');
    expect(AI.errorKind(404, '{"error":{"code":"model_not_found"}}')).toBe('badmodel');
    expect(AI.errorKind(400, 'API key not valid. Please pass a valid API key.')).toBe('badkey');
    expect(AI.errorKind(500, 'overloaded')).toBe('http');
  });

  it('lists chat models and recommends a cheap fast one', () => {
    const openai = AI.modelList('openai', { data: [{ id: 'gpt-6.2-astra' }, { id: 'text-embedding-3-small' }, { id: 'gpt-6-luna' }, { id: 'whisper-1' }] });
    expect(openai.models).toEqual(['gpt-6-luna', 'gpt-6.2-astra']);
    expect(openai.suggested).toBe('gpt-6-luna');
    // the free-tier Gemini model, even when a newer paid-only one is listed
    const gemini = AI.modelList('gemini', { data: [{ id: 'models/gemini-3.8-flash' }, { id: 'models/gemini-3.5-flash' }, { id: 'models/gemini-embedding-2' }] });
    expect(gemini.models).toEqual(['gemini-3.5-flash', 'gemini-3.8-flash']);
    expect(gemini.suggested).toBe('gemini-3.5-flash');
    expect(AI.modelList('gemini', { data: [{ id: 'models/gemini-3.1-flash-lite' }, { id: 'models/gemini-3.8-flash' }] }).suggested).toBe('gemini-3.1-flash-lite');
    const groq = AI.modelList('groq', { data: [{ id: 'whisper-large-v3' }, { id: 'meta-llama/llama-prompt-guard-2-86m' }, { id: 'openai/gpt-oss-120b' }, { id: 'llama-3.3-70b-versatile' }] });
    expect(groq.models).toEqual(['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']);
    expect(groq.suggested).toBe('openai/gpt-oss-120b');
    expect(AI.modelList('anthropic', { data: [{ id: 'claude-opus-5-5' }, { id: 'claude-haiku-6' }] }).suggested).toBe('claude-haiku-6');
    expect(AI.modelsRequest({ provider: 'openai' }, 'k').url).toBe('https://api.openai.com/v1/models');
  });

  it('lets the automatic check point every service at a stand-in server', () => {
    process.env.MWANGA_AI_BASE = 'http://127.0.0.1:9/v1/';
    expect(AI.verseRequest({ provider: 'openai' }, 'k', 'x').url).toBe('http://127.0.0.1:9/v1/chat/completions');
  });
});

describe('Ask AI settings', () => {
  it('keeps the 0.8.0 Claude setting working', () => {
    expect(aiConfig({ aiModel: 'claude-x' })).toEqual({ provider: 'anthropic', model: 'claude-x', baseUrl: '' });
    expect(aiConfig({ aiProvider: 'openai', aiModel: 'claude-x' }).model).toBe('');
  });

  it('is ready when the chosen service has a key, or an address and model for another service', () => {
    const ai = { keys: { anthropic: false, openai: true } };
    expect(aiReady(ai, { aiProvider: 'openai' })).toBe(true);
    expect(aiReady(ai, { aiProvider: 'anthropic' })).toBe(false);
    expect(aiReady(ai, { aiProvider: 'custom', aiBaseUrl: 'http://localhost:11434/v1' })).toBe(false);
    expect(aiReady(ai, withAiModel({ aiProvider: 'custom', aiBaseUrl: 'http://localhost:11434/v1' }, 'custom', 'llama3.2'))).toBe(true);
  });
});
