// Platform bridge.
//
// In Electron, every call is forwarded to the real main-process core (store,
// engine, webhook, updater) over IPC. In a plain web build (workspace preview),
// a self-contained fallback simulates the same surface using localStorage and a
// local timed engine, so the entire UI remains fully interactive.

import { WebEngine } from './webEngine.js';

const hasElectron = typeof window !== 'undefined' && window.shadow?.isElectron;

// ---------------------------------------------------------------------------
// Web fallback: localStorage-backed store mirroring the main-process domains.
const webStore = {
  get(domain, fallback) {
    try {
      const raw = localStorage.getItem(`shadow:${domain}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(domain, value) {
    try {
      localStorage.setItem(`shadow:${domain}`, JSON.stringify(value));
    } catch {}
    return true;
  },
};

const webEngine = hasElectron ? null : new WebEngine(webStore);

export const bridge = {
  isElectron: hasElectron,

  store: {
    get: (domain, fallback) =>
      hasElectron ? window.shadow.store.get(domain, fallback) : Promise.resolve(webStore.get(domain, fallback)),
    set: (domain, value) =>
      hasElectron ? window.shadow.store.set(domain, value) : Promise.resolve(webStore.set(domain, value)),
  },

  engine: {
    start: () => (hasElectron ? window.shadow.engine.start() : webEngine.start()),
    pause: () => (hasElectron ? window.shadow.engine.pause() : webEngine.pause()),
    resume: () => (hasElectron ? window.shadow.engine.resume() : webEngine.resume()),
    stop: () => (hasElectron ? window.shadow.engine.stop() : webEngine.stop()),
    getState: () => (hasElectron ? window.shadow.engine.getState() : Promise.resolve(webEngine.getState())),
    onState: (cb) => (hasElectron ? window.shadow.engine.onState(cb) : webEngine.on('state', cb)),
    onLog: (cb) => (hasElectron ? window.shadow.engine.onLog(cb) : webEngine.on('log', cb)),
    onHistory: (cb) => (hasElectron ? window.shadow.engine.onHistory(cb) : webEngine.on('history', cb)),
  },

  webhook: {
    test: (profile) =>
      hasElectron
        ? window.shadow.webhook.test(profile)
        : Promise.resolve({ ok: false, reason: 'Webhook sending requires the desktop app (web preview).' }),
  },

  recorder: {
    available: () => (hasElectron ? window.shadow.recorder.available() : Promise.resolve(false)),
    start: (options) =>
      hasElectron ? window.shadow.recorder.start(options) : Promise.resolve({ ok: false, reason: 'unavailable' }),
    stop: () => (hasElectron ? window.shadow.recorder.stop() : Promise.resolve({ ok: false, steps: [] })),
    onStep: (cb) => (hasElectron ? window.shadow.recorder.onStep(cb) : () => {}),
    onStopped: (cb) => (hasElectron ? window.shadow.recorder.onStopped(cb) : () => {}),
  },

  input: {
    available: () => (hasElectron ? window.shadow.input.available() : Promise.resolve(false)),
  },

  updater: {
    check: () =>
      hasElectron
        ? window.shadow.updater.check()
        : Promise.resolve({
            currentVersion: '1.0.0',
            latestVersion: '1.0.0',
            available: false,
            notes: 'You are running the latest version of Shadow Macro. (web preview)',
            checkedAt: new Date().toISOString(),
          }),
    backup: () =>
      hasElectron
        ? window.shadow.updater.backup()
        : Promise.resolve({
            backupDir: '(web preview)',
            copied: ['settings.json', 'profiles.json', 'macros.json', 'run-history.json'],
            createdAt: new Date().toISOString(),
          }),
    openDownload: (url) =>
      hasElectron ? window.shadow.updater.openDownload(url) : Promise.resolve(window.open?.(url, '_blank')),
  },

  window: {
    minimizeToTray: () => (hasElectron ? window.shadow.window.minimizeToTray() : Promise.resolve()),
  },

  app: {
    exit: () => (hasElectron ? window.shadow.app.exit() : Promise.resolve()),
    getVersion: () => (hasElectron ? window.shadow.app.getVersion() : Promise.resolve('1.0.0')),
  },
};
