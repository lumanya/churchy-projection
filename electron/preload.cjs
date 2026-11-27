// The only bridge between the web pages and the computer. Pages get these functions and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const h = (_e, data) => fn(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('mwanga', {
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
    open: () => ipcRenderer.invoke('output:open'),
    close: () => ipcRenderer.invoke('output:close'),
    move: () => ipcRenderer.invoke('output:move'),
    onState: on('output:state')
  },
  live: {
    set: (live) => ipcRenderer.send('live:set', live),
    onUpdate: on('live:update')
  },
  openFiles: (filters) => ipcRenderer.invoke('file:open', filters)
});
