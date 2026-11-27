// Which AI service the operator chose, and whether Ask AI can be used with it
export function aiConfig(settings) {
  const s = settings || {};
  const provider = s.aiProvider || 'anthropic';
  const models = s.aiModels || {};
  // 0.8.0 had one optional model setting, for Claude
  const model = models[provider] || (provider === 'anthropic' ? s.aiModel || '' : '');
  return { provider, model, baseUrl: s.aiBaseUrl || '' };
}

export function aiReady(ai, settings) {
  const { provider, model, baseUrl } = aiConfig(settings);
  if (provider === 'custom') return !!baseUrl.trim() && !!model.trim();
  return !!(ai && ai.keys && ai.keys[provider]);
}

// settings with the model for one service changed
export function withAiModel(settings, provider, model) {
  return { ...settings, aiModels: { ...(settings.aiModels || {}), [provider]: model } };
}
