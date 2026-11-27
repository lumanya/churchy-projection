// Inside Electron, window.mwanga comes from electron/preload.cjs.
// In a plain browser (npm run dev, for quick design work) this stand-in keeps the app usable:
// data goes to localStorage and the output opens in a second tab.
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
    displays: { list: async () => [{ id: 1, label: 'This screen (browser preview)' }], onChanged: () => () => {} },
    output: {
      isOpen: async () => !!(outWin && !outWin.closed),
      open: async () => { outWin = window.open('#/output', 'mwanga-output', 'width=960,height=540'); return true; },
      close: async () => { if (outWin) outWin.close(); return true; },
      move: async () => true,
      onState: () => () => {}
    },
    live: {
      set: (live) => { ls.set('live', live); ch && ch.postMessage(live); },
      onUpdate: (fn) => { listeners.add(fn); const last = ls.get('live'); if (last) setTimeout(() => fn(last)); return () => listeners.delete(fn); }
    },
    openFiles: (filters) => new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = (filters || []).flatMap((f) => f.extensions.map((e) => '.' + e)).join(',');
      input.onchange = async () => resolve(await Promise.all(Array.from(input.files).map(async (f) => ({ name: f.name, text: await f.text() }))));
      input.click();
    })
  };
}

export const api = window.mwanga || browserBridge();
export const inElectron = !!window.mwanga;
