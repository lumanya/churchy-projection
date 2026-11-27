// Runs in its own Electron utility process so speech recognition never slows the operator screen.
// Messages in:  { type: 'init', quality, cacheDir } · { type: 'audio', samples, language }
// Messages out: { type: 'progress', ... } · { type: 'ready', model } · { type: 'text', text, ms } · { type: 'error', message }
import { createTranscriber } from './listener-core.mjs';

const port = process.parentPort;
let transcriber = null;
let busy = false;
let pending = null; // only the newest audio waits; older chunks are dropped if the PC is slow

async function run(job) {
  busy = true;
  try {
    const t0 = Date.now();
    const text = await transcriber.transcribe(job.samples, job.language);
    port.postMessage({ type: 'text', text, ms: Date.now() - t0 });
  } catch (e) {
    port.postMessage({ type: 'error', message: e.message });
  }
  busy = false;
  if (pending) { const next = pending; pending = null; run(next); }
}

port.on('message', async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      let last = 0;
      transcriber = await createTranscriber({
        quality: msg.quality,
        cacheDir: msg.cacheDir,
        onProgress: (p) => {
          // report download progress about twice a second
          const now = Date.now();
          if (p.status === 'progress' && now - last < 500) return;
          last = now;
          port.postMessage({ type: 'progress', status: p.status, file: p.file, loaded: p.loaded, total: p.total, progress: p.progress });
        }
      });
      port.postMessage({ type: 'ready', model: transcriber.model });
    } catch (err) {
      port.postMessage({ type: 'error', message: err.message, during: 'init' });
    }
  } else if (msg.type === 'audio' && transcriber) {
    const job = { samples: new Float32Array(msg.samples), language: msg.language };
    if (busy) pending = job; else run(job);
  }
});
