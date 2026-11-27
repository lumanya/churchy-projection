// Speech to text with Whisper, running on this computer (no internet needed after the model is downloaded once).
// Used by electron/listener.mjs inside Mwanga, and by scripts/listen-smoke.mjs in the GitHub check.
import { pipeline, env } from '@huggingface/transformers';

export const MODELS = {
  fast: { id: 'onnx-community/whisper-base', label: 'Fast', approxMB: 80 },
  better: { id: 'onnx-community/whisper-small', label: 'Better', approxMB: 250 }
};

const LANG = { en: 'english', sw: 'swahili' };

// Whisper sometimes "hears" these in silence or music; never treat them as speech.
const HALLUCINATIONS = /^(\s*(thank you( for watching)?|thanks for watching|asante( sana)?|subtitles? by.*|\[.*\]|\(.*\)|music|you)[.!]?\s*)+$/i;

export async function createTranscriber({ quality = 'fast', cacheDir, onProgress } = {}) {
  if (cacheDir) env.cacheDir = cacheDir;
  env.allowRemoteModels = true;
  const model = (MODELS[quality] || MODELS.fast).id;
  const asr = await pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    device: 'cpu',
    progress_callback: (p) => onProgress && onProgress(p)
  });
  return {
    model,
    // samples: Float32Array, mono, 16 kHz. language: 'en', 'sw' or 'auto'.
    async transcribe(samples, language = 'auto') {
      // max_new_tokens: a few seconds of speech is never more than ~60 words; stops runaway repetition early
      const opts = { task: 'transcribe', return_timestamps: false, max_new_tokens: 96, no_repeat_ngram_size: 4 };
      if (LANG[language]) opts.language = LANG[language];
      const out = await asr(samples, opts);
      const text = String((out && out.text) || '').trim()
        .replace(/(\S{1,6}?)\1{4,}/g, '$1')            // "wewewewewewe…" → "we"
        .replace(/\b(\w+)([,\s]+\1\b){3,}/gi, '$1');  // "nudu, nudu, nudu, nudu" → "nudu"

      return HALLUCINATIONS.test(text) ? '' : text;
    },
    dispose: () => asr.dispose && asr.dispose()
  };
}
