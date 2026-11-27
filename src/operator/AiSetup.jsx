import React, { useState } from 'react';
import { api } from '../bridge.js';
import { aiConfig, withAiModel } from '../lib/aiConfig.js';

const TEST_WORDS = 'God loved the world so much that he gave his only son';

// Library → Bible → Ask AI: choose the AI service, save its key, pick a model and test it
export default function AiSetup({ t, settings, setSettings, ai, setAi, flash }) {
  const [key, setKey] = useState('');
  const [models, setModels] = useState({}); // provider → model names the service offered
  const [test, setTest] = useState(null); // { busy } | { ok, refs } | { error }
  const cfg = aiConfig(settings);
  const providers = (ai && ai.providers) || [];
  const p = providers.find((x) => x.id === cfg.provider) || { id: cfg.provider, name: cfg.provider };
  const hasKey = !!(ai && ai.keys && ai.keys[cfg.provider]);
  const custom = cfg.provider === 'custom';

  const choose = (provider) => { setSettings({ ...settings, aiProvider: provider }); setTest(null); setKey(''); };
  const saveKey = async () => { setAi(await api.ai.setKey(cfg.provider, key)); setKey(''); setTest(null); flash(t('saved')); };

  const runTest = async () => {
    setTest({ busy: true });
    let c = cfg;
    const list = await api.ai.models(cfg);
    if (list.models && list.models.length) {
      setModels((m) => ({ ...m, [cfg.provider]: list.models }));
      // no model chosen, or one the service no longer has: use the one it recommends
      if ((!c.model || !list.models.includes(c.model)) && list.suggested && !(custom && c.model)) {
        c = { ...c, model: list.suggested };
        setSettings(withAiModel(settings, cfg.provider, list.suggested));
      }
    }
    const r = await api.ai.findVerses(TEST_WORDS, c);
    setTest(r.error ? { error: r.error, model: r.model, seconds: r.seconds } : { ok: true, refs: r.refs || [], model: r.model, seconds: r.seconds });
  };

  const listId = 'ai-models-' + cfg.provider;
  const canTest = custom ? !!cfg.baseUrl.trim() && !!cfg.model.trim() : hasKey;

  return (
    <div className="ai-box">
      <strong>✦ {t('askAi')}</strong>
      <p className="muted small" style={{ margin: 0 }}>{t('aiHelp')}</p>
      <label className="small muted" htmlFor="ai-provider">{t('aiService')}</label>
      <select id="ai-provider" value={cfg.provider} onChange={(e) => choose(e.target.value)}>
        {providers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <p className="muted small" style={{ margin: 0 }}>{custom ? t('aiCustomHelp') : t('aiSubNote')}</p>

      {custom && (
        <input id="ai-base" value={settings.aiBaseUrl || ''} onChange={(e) => setSettings({ ...settings, aiBaseUrl: e.target.value })}
          placeholder={t('aiAddress')} aria-label={t('aiAddress')} autoComplete="off" spellCheck={false} />
      )}

      {hasKey ? (
        <div className="row between">
          <span className="small accent">{t('aiKeySaved')}</span>
          <button type="button" className="sm" onClick={async () => { setAi(await api.ai.setKey(cfg.provider, '')); setTest(null); }}>{t('remove')}</button>
        </div>
      ) : (
        <div className="row">
          <input id="ai-key" className="grow" type="password" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={custom ? t('aiKeyOptional') : t('aiKeyPlaceholder')} aria-label={t('aiKeyPlaceholder')} autoComplete="off" />
          <button type="button" id="ai-save" className="sm primary" disabled={!key.trim()} onClick={saveKey}>{t('save')}</button>
          {p.keyUrl && <button type="button" className="sm" onClick={() => api.ai.openKeyPage(cfg.provider)}>{t('aiGetKey')}</button>}
        </div>
      )}

      <div className="row">
        <input id="ai-model" className="grow" list={listId} value={cfg.model}
          onChange={(e) => setSettings(withAiModel(settings, cfg.provider, e.target.value))}
          placeholder={custom ? t('aiModelNeeded') : `${t('aiModelDefault')}: ${p.model || ''}`} aria-label={t('aiModel')} autoComplete="off" spellCheck={false} />
        <datalist id={listId}>{(models[cfg.provider] || []).map((m) => <option key={m} value={m} />)}</datalist>
        <button type="button" id="ai-test" className="sm" disabled={!canTest || (test && test.busy)} onClick={runTest}>{test && test.busy ? t('aiTesting') : t('aiTest')}</button>
      </div>
      {test && test.ok && <span className="small accent" id="ai-test-result">{t('aiWorks')}: {test.refs.length ? test.refs.join(', ') : '—'}</span>}
      {test && test.error && <span className="small" id="ai-test-result">{t('aiError_' + test.error)}</span>}
      {test && test.model && <span className="small muted mono">{test.model} · {test.seconds} s</span>}
    </div>
  );
}
