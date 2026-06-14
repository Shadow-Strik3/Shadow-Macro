// Shadow Macro — Electron main process.
//
// Hosts the full core: the macro engine, persistent data store, Discord webhook
// delivery, updater/backup, system tray, startup behavior and auto pause/resume.
// The renderer is a thin client that drives this process over IPC and renders
// engine events.

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkForUpdates, backupBeforeUpdate } from './updater.js';
import * as store from './store.js';
import { engine } from './engine.js';
import { webhook } from './webhook.js';
import { recorder } from './recorder.js';
import { inputDriver } from './inputDriver.js';
import { defaultProfiles, defaultMacrosForProfiles, DEFAULT_SETTINGS } from './defaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;
let isQuitting = false;

// --------------------------------------------------------------------------
// First-run seeding of the persistent store.
function seedStore() {
  const settings = store.get('settings', null);
  if (!settings) {
    const profiles = defaultProfiles();
    store.set('settings', { ...DEFAULT_SETTINGS, activeProfileId: profiles[0].id });
    store.set('profiles', profiles);
    store.set('macros', defaultMacrosForProfiles(profiles));
    store.set('history', []);
  } else {
    // ensure all keys exist
    store.get('profiles', defaultProfiles());
    store.get('macros', {});
    store.get('history', []);
  }
}

function setting(key, fallback) {
  return store.get('settings', {})[key] ?? fallback;
}

// --------------------------------------------------------------------------
function resolveRendererURL() {
  if (isDev) return 'http://localhost:5173';
  return `file://${path.join(__dirname, '../../dist/index.html')}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0d12',
    show: false,
    title: 'Shadow Macro',
    // Hide the native menu bar — Shadow Macro is driven by its in-window UI and
    // the system tray, so the default "File / Edit / View / …" menu is removed.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(resolveRendererURL());

  // Fully hide the menu bar (so it doesn't even appear when Alt is pressed).
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  const startMinimized = setting('startMinimizedToTray', false) || process.argv.includes('--minimized');
  mainWindow.once('ready-to-show', () => {
    if (!startMinimized) mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting && setting('closeToTray', true)) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Auto pause/resume when the app loses/gains focus.
  mainWindow.on('blur', () => {
    if (setting('autoPauseResume', true) && engine.getState().status === 'running') {
      engine.pause();
    }
  });
  mainWindow.on('focus', () => {
    if (setting('autoPauseResume', true) && engine.getState().status === 'paused') {
      engine.resume();
    }
  });
}

function trayIcon() {
  const dataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAVUlEQVR4nGNgGAWjYBSMglEwCgYJYGRgYPjPwMDwn4GBgYGBkYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYEBAH9bA0r6dQ0kAAAAAElFTkSuQmCC';
  return nativeImage.createFromDataURL(dataUrl);
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function showDashboard() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Shadow Macro');
  rebuildTrayMenu();
  tray.on('double-click', showDashboard);
}

function rebuildTrayMenu() {
  if (!tray) return;
  const st = engine.getState().status;
  const menu = Menu.buildFromTemplate([
    { label: 'Shadow Macro', enabled: false },
    { type: 'separator' },
    { label: 'Start Macro', enabled: st === 'idle' || st === 'paused', click: () => engine.start() },
    { label: 'Pause Macro', enabled: st === 'running', click: () => engine.pause() },
    { label: 'Stop Macro', enabled: st !== 'idle', click: () => engine.stop() },
    { type: 'separator' },
    { label: 'Open Dashboard', click: showDashboard },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

// Automatic update check on startup, gated by user settings. Result is pushed
// to the renderer so the UI can surface "update available" without a manual click.
function maybeAutoCheckUpdates() {
  const enabled = setting('autoUpdateEnabled', true);
  const onStartup = setting('autoUpdateCheckOnStartup', true);
  if (!enabled || !onStartup) return;
  // small delay so the window/UI is ready to receive the event
  setTimeout(async () => {
    try {
      const info = await checkForUpdates({ auto: true });
      sendToRenderer('updater:info', info);
    } catch {
      /* best-effort */
    }
  }, 4000);
}

function applyLaunchOnStartup(enabled) {
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    args: setting('startMinimizedToTray', false) ? ['--minimized'] : [],
  });
}

// --------------------------------------------------------------------------
function wireEngineEvents() {
  engine.on('state', (state) => {
    sendToRenderer('engine:state', state);
    rebuildTrayMenu();
    if (tray) tray.setToolTip(`Shadow Macro — ${state.status}`);
  });
  engine.on('log', (entry) => sendToRenderer('engine:log', entry));
  engine.on('history', (record) => sendToRenderer('engine:history', record));

  // Recorder → renderer (live captured steps).
  recorder.on('step', (step) => sendToRenderer('recorder:step', step));
  recorder.on('stopped', (steps) => sendToRenderer('recorder:stopped', steps));
}

function registerIpc() {
  // settings & data
  ipcMain.handle('store:get', (_e, domain, fallback) => store.get(domain, fallback));
  ipcMain.handle('store:set', (_e, domain, value) => {
    store.set(domain, value);
    if (domain === 'settings') applyLaunchOnStartup(value.launchOnStartup);
    return true;
  });

  // engine
  ipcMain.handle('engine:start', () => engine.start());
  ipcMain.handle('engine:pause', () => engine.pause());
  ipcMain.handle('engine:resume', () => engine.resume());
  ipcMain.handle('engine:stop', () => engine.stop());
  ipcMain.handle('engine:getState', () => engine.getState());

  // webhook
  ipcMain.handle('webhook:test', async (_e, profile) => webhook.test(profile));

  // recorder
  ipcMain.handle('recorder:available', async () => recorder.isAvailable());
  ipcMain.handle('recorder:start', async (_e, options) => recorder.start(options));
  ipcMain.handle('recorder:stop', async () => recorder.stop());

  // input driver capability (so UI can show whether real input is active)
  ipcMain.handle('input:available', async () => inputDriver.isAvailable());

  // updater
  ipcMain.handle('updater:check', async () => checkForUpdates());
  ipcMain.handle('updater:backup', async () => backupBeforeUpdate());
  ipcMain.handle('updater:openDownload', async (_e, url) => {
    if (url && /^https?:\/\//.test(url)) await shell.openExternal(url);
    return true;
  });

  // window / app
  ipcMain.handle('window:minimizeToTray', () => mainWindow?.hide());
  ipcMain.handle('app:exit', () => {
    isQuitting = true;
    app.quit();
  });
  ipcMain.handle('app:getVersion', () => app.getVersion());
}

// --------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showDashboard);

  app.whenReady().then(() => {
    // Remove the default application menu entirely (no File/Edit/View/…).
    Menu.setApplicationMenu(null);
    seedStore();
    registerIpc();
    wireEngineEvents();
    createWindow();
    buildTray();
    applyLaunchOnStartup(setting('launchOnStartup', false));
    maybeAutoCheckUpdates();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    engine.stop();
    store.flushAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) app.quit();
  });
}
