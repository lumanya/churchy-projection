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
  openFiles: (filters, binary) => ipcRenderer.invoke('file:open', filters, !!binary),
  findEasyWorship: () => ipcRenderer.invoke('easyworship:find'),
  findVideoPsalm: () => ipcRenderer.invoke('videopsalm:find')
});
