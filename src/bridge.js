// Three ways the app can be running:
//  1. inside Electron: window.mwanga comes from electron/preload.cjs
//  2. on a phone, served by Mwanga's remote server: talks to it over HTTP with the PIN
//  3. in a plain browser (npm run dev, for design work): data in localStorage, output in a second tab
const noop = () => () => {};
const stubs = {
  version: async () => 'dev',
  stage: { isOpen: async () => false, open: async () => true, close: async () => true, move: async () => true, onState: noop },
  stream: { isOpen: async () => false, open: async () => true, close: async () => true, move: async () => true, onState: noop },
  remote: { start: async () => ({ on: false, urls: [] }), stop: async () => ({ on: false, urls: [] }), info: async () => ({ on: false, urls: [] }), qr: async () => '', onInfo: noop, onCommand: noop },
  update: { status: async () => ({ state: 'idle' }), download: async () => true, install: async () => true, onStatus: noop },
  findEasyWorship: async () => null,
  findVideoPsalm: async () => null,
  listen: { start: async () => false, stop: async () => true, audio: () => {}, onEvent: noop },
  media: { import: async () => [], remove: async () => true, saveThumb: async () => null, url: () => '', thumbUrl: () => '' },
  video: { report: () => {}, onProgress: noop }
};

// pin: phone with control. view: the livestream page, which can only watch.
function webBridge(pin, view) {
  const q = pin ? `pin=${encodeURIComponent(pin)}` : `view=${encodeURIComponent(view)}`;
  return {
    ...stubs,
    kind: 'phone',
    live: {
      set: () => {},
      onUpdate: (fn, onStatus) => {
        let es = null;
        let closed = false;
        const connect = () => {
          es = new EventSource(`/api/events?${q}`);
          es.onopen = () => onStatus && onStatus('connected');
          es.onmessage = (e) => { try { fn(JSON.parse(e.data)); } catch (_) { /* ignore */ } };
          es.onerror = () => { onStatus && onStatus('reconnecting'); es.close(); if (!closed) setTimeout(connect, 2000); };
        };
        connect();
        return () => { closed = true; es && es.close(); };
      }
    },
    media: {
      ...stubs.media,
      url: (m) => { const f = typeof m === 'string' ? m : m && m.file; return f ? `/api/media/${encodeURIComponent(f)}?${q}` : ''; },
      thumbUrl: () => ''
    },
    command: (cmd) => fetch(`/api/command?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) })
  };
}

function browserBridge() {
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mwanga-live') : null;
  const ls = {
    get: (k) => { try { return JSON.parse(localStorage.getItem('mwanga:' + k)); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem('mwanga:' + k, JSON.stringify(v)); } catch (_) { /* full */ } }
  };
  const listeners = new Set();
  if (ch) ch.onmessage = (e) => listeners.forEach((fn) => fn(e.data));
  let outWin = null;
  return {
    ...stubs,
    kind: 'browser',
    store: {
      load: async () => ({ library: ls.get('library.json'), settings: ls.get('settings.json'), session: ls.get('session.json') }),
      save: async (name, data) => { ls.set(name, data); return true; }
    },
    bible: {
      list: async () => [{ id: 'kjv', name: 'King James Version', short: 'KJV', lang: 'en', bundled: true }, ...(ls.get('bibles') || [])],
      load: async (id) => {
        if (id === 'kjv') return (await fetch('./bibles/kjv.json')).text();
        return JSON.stringify(ls.get('bible:' + id));
      },
      save: async (b) => { ls.set('bible:' + b.id, b); ls.set('bibles', [...(ls.get('bibles') || []).filter((x) => x.id !== b.id), { id: b.id, name: b.name, short: b.short || '', lang: b.lang }]); return b.id; },
      remove: async (id) => { ls.set('bibles', (ls.get('bibles') || []).filter((x) => x.id !== id)); return true; }
    },
    displays: { list: async () => [{ id: 1, label: 'This screen (browser preview)' }], onChanged: noop },
    output: {
      isOpen: async () => !!(outWin && !outWin.closed),
      open: async () => { outWin = window.open('#/output', 'mwanga-output', 'width=960,height=540'); return true; },
      close: async () => { if (outWin) outWin.close(); return true; },
      move: async () => true,
      onState: noop
    },
    live: {
      set: (live) => { ls.set('live', live); ch && ch.postMessage(live); },
      onUpdate: (fn) => { listeners.add(fn); const last = ls.get('live'); if (last) setTimeout(() => fn(last)); return () => listeners.delete(fn); }
    },
    openFiles: (filters, binary) => new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = (filters || []).flatMap((f) => f.extensions.map((e) => '.' + e)).join(',');
      input.onchange = async () => resolve(await Promise.all(Array.from(input.files).map(async (f) => (
        binary ? { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : { name: f.name, text: await f.text() }
      ))));
      input.click();
    })
  };
}

function choose() {
  if (window.mwanga) return window.mwanga;
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view) return webBridge(null, view);
  const pin = params.get('pin') || sessionStorage.getItem('mwanga-pin');
  if (pin) { sessionStorage.setItem('mwanga-pin', pin); return webBridge(pin); }
  return browserBridge();
}

export const api = choose();
export const inElectron = api.kind === 'electron';
export const onPhone = api.kind === 'phone';
