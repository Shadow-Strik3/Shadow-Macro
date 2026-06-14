// Secure bridge between the renderer and main process (CommonJS — Electron
// preload). Exposes the full core API. The renderer detects this bridge and
// falls back to a local simulation when running as a plain web build.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shadow', {
  isElectron: true,

  store: {
    get: (domain, fallback) => ipcRenderer.invoke('store:get', domain, fallback),
    set: (domain, value) => ipcRenderer.invoke('store:set', domain, value),
  },

  engine: {
    start: () => ipcRenderer.invoke('engine:start'),
    pause: () => ipcRenderer.invoke('engine:pause'),
    resume: () => ipcRenderer.invoke('engine:resume'),
    stop: () => ipcRenderer.invoke('engine:stop'),
    getState: () => ipcRenderer.invoke('engine:getState'),
    onState: (cb) => {
      const h = (_e, s) => cb(s);
      ipcRenderer.on('engine:state', h);
      return () => ipcRenderer.removeListener('engine:state', h);
    },
    onLog: (cb) => {
      const h = (_e, l) => cb(l);
      ipcRenderer.on('engine:log', h);
      return () => ipcRenderer.removeListener('engine:log', h);
    },
    onHistory: (cb) => {
      const h = (_e, r) => cb(r);
      ipcRenderer.on('engine:history', h);
      return () => ipcRenderer.removeListener('engine:history', h);
    },
  },

  webhook: {
    test: (profile) => ipcRenderer.invoke('webhook:test', profile),
  },

  recorder: {
    available: () => ipcRenderer.invoke('recorder:available'),
    start: (options) => ipcRenderer.invoke('recorder:start', options),
    stop: () => ipcRenderer.invoke('recorder:stop'),
    onStep: (cb) => {
      const h = (_e, s) => cb(s);
      ipcRenderer.on('recorder:step', h);
      return () => ipcRenderer.removeListener('recorder:step', h);
    },
    onStopped: (cb) => {
      const h = (_e, s) => cb(s);
      ipcRenderer.on('recorder:stopped', h);
      return () => ipcRenderer.removeListener('recorder:stopped', h);
    },
  },

  input: {
    available: () => ipcRenderer.invoke('input:available'),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    backup: () => ipcRenderer.invoke('updater:backup'),
    openDownload: (url) => ipcRenderer.invoke('updater:openDownload', url),
  },

  window: {
    minimizeToTray: () => ipcRenderer.invoke('window:minimizeToTray'),
  },

  app: {
    exit: () => ipcRenderer.invoke('app:exit'),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
});
