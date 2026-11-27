// The only bridge between the web pages and the computer. Pages get these functions and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const h = (_e, data) => fn(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('mwanga', {
  kind: 'electron',
  version: () => ipcRenderer.invoke('app:version'),
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (name, data) => ipcRenderer.invoke('store:save', name, data)
  },
  bible: {
    list: () => ipcRenderer.invoke('bible:list'),
    load: (id) => ipcRenderer.invoke('bible:load', id),
    save: (bible) => ipcRenderer.invoke('bible:save', bible),
    remove: (id) => ipcRenderer.invoke('bible:remove', id)
  },
  displays: {
    list: () => ipcRenderer.invoke('displays:list'),
    onChanged: on('displays:changed')
  },
  output: {
    isOpen: () => ipcRenderer.invoke('output:isOpen'),
    open: () => ipcRenderer.invoke('output:open'),
    close: () => ipcRenderer.invoke('output:close'),
    move: () => ipcRenderer.invoke('output:move'),
    onState: on('output:state')
  },
  stage: {
    isOpen: () => ipcRenderer.invoke('stage:isOpen'),
    open: () => ipcRenderer.invoke('stage:open'),
    close: () => ipcRenderer.invoke('stage:close'),
    move: () => ipcRenderer.invoke('stage:move'),
    onState: on('stage:state')
  },
  stream: {
    isOpen: () => ipcRenderer.invoke('stream:isOpen'),
    open: () => ipcRenderer.invoke('stream:open'),
    close: () => ipcRenderer.invoke('stream:close'),
    move: () => ipcRenderer.invoke('stream:move'),
    onState: on('stream:state')
  },
  remote: {
    start: () => ipcRenderer.invoke('remote:start'),
    stop: () => ipcRenderer.invoke('remote:stop'),
    info: () => ipcRenderer.invoke('remote:info'),
    qr: (text) => ipcRenderer.invoke('remote:qr', text),
    onInfo: on('remote:info'),
    onCommand: on('remote:command')
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: on('update:status')
  },
  live: {
    set: (live) => ipcRenderer.send('live:set', live),
    onUpdate: on('live:update')
  },
  listen: {
    start: (quality) => ipcRenderer.invoke('listen:start', quality),
    stop: () => ipcRenderer.invoke('listen:stop'),
    audio: (samples, language) => ipcRenderer.send('listen:audio', samples, language),
    onEvent: on('listen:event')
  },
  media: {
    import: () => ipcRenderer.invoke('media:import'),
    remove: (entry) => ipcRenderer.invoke('media:remove', entry),
    saveThumb: (id, dataUrl) => ipcRenderer.invoke('media:saveThumb', id, dataUrl),
    url: (m) => { const f = typeof m === 'string' ? m : m && m.file; return f ? `mwanga-media://m/${encodeURIComponent(f)}` : ''; },
    thumbUrl: (m) => (m && m.thumb ? `mwanga-media://m/t/${encodeURIComponent(m.thumb)}` : '')
  },
  video: {
    report: (p) => ipcRenderer.send('video:progress', p),
    onProgress: on('video:progress')
  },
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    setKey: (provider, key) => ipcRenderer.invoke('ai:setKey', provider, key),
    findVerses: (query, cfg) => ipcRenderer.invoke('ai:findVerses', query, cfg),
    models: (cfg) => ipcRenderer.invoke('ai:models', cfg),
    openKeyPage: (provider) => ipcRenderer.invoke('ai:openKeyPage', provider)
  },
  openFiles: (filters, binary) => ipcRenderer.invoke('file:open', filters, !!binary),
  findEasyWorship: () => ipcRenderer.invoke('easyworship:find'),
  findVideoPsalm: () => ipcRenderer.invoke('videopsalm:find')
});
