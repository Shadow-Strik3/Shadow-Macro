import { create } from 'zustand';
import { bridge } from '../lib/bridge.js';
import { defaultProfiles, defaultMacro, DELAY_PRESETS } from '../data/presets.js';

// Renderer state = thin client over the core (main process in Electron, or the
// web-fallback engine in the preview). Data lives in the core's persistent
// store; engine state arrives via subscription events. The renderer never runs
// its own timing loop anymore.

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Upgrade legacy steps (label-only `action`) to the new typed-step schema so
// older saved macros keep working with the recorder/editor and engine.
function normalizeMacros(macros) {
  if (!macros) return macros;
  const out = {};
  for (const [pid, macro] of Object.entries(macros)) {
    out[pid] = {
      ...macro,
      stages: (macro.stages || []).map((stage) => ({
        ...stage,
        steps: (stage.steps || []).map((s) => {
          if (s.type) return s; // already migrated
          return {
            id: s.id || `s-${uid()}`,
            type: 'action',
            enabled: s.enabled !== false,
            repeat: s.repeat || 1,
            delayAfter: null,
            value: s.action || s.value || 'Action',
          };
        }),
      })),
    };
  }
  return out;
}

const DEFAULT_SETTINGS = {
  launchOnStartup: false,
  startMinimizedToTray: false,
  closeToTray: true,
  sessionCountdown: 3,
  autoPauseResume: true,
  testMode: false,
  theme: 'dark',
  activeProfileId: 'solo',
  autoUpdateEnabled: true,
  autoUpdateCheckOnStartup: true,
};

export const useStore = create((set, get) => ({
  hydrated: false,
  settings: { ...DEFAULT_SETTINGS },
  profiles: [],
  macros: {},
  history: [],
  updateInfo: null,

  engine: {
    status: 'idle',
    countdown: 0,
    elapsedMs: 0,
    loopsCompleted: 0,
    currentStageId: null,
    currentStep: null,
    currentMacroName: '',
    sessionStartedAt: null,
    testMode: false,
    log: [],
  },

  _unsubs: [],

  // -------------------------------------------------------------------------
  async hydrate() {
    let [settings, profiles, macros, history] = await Promise.all([
      bridge.store.get('settings', null),
      bridge.store.get('profiles', null),
      bridge.store.get('macros', null),
      bridge.store.get('history', []),
    ]);

    if (!profiles || !profiles.length) {
      profiles = defaultProfiles();
      bridge.store.set('profiles', profiles);
    }
    if (!settings) {
      settings = { ...DEFAULT_SETTINGS, activeProfileId: profiles[0].id };
      bridge.store.set('settings', settings);
    } else {
      settings = { ...DEFAULT_SETTINGS, ...settings };
    }
    if (!macros) {
      macros = {};
      for (const p of profiles) macros[p.id] = defaultMacro(p.macroName, p.id);
      bridge.store.set('macros', macros);
    } else {
      const migrated = normalizeMacros(macros);
      if (JSON.stringify(migrated) !== JSON.stringify(macros)) {
        macros = migrated;
        bridge.store.set('macros', macros);
      } else {
        macros = migrated;
      }
    }

    // Subscribe to engine events from the core.
    const unsubs = [];
    unsubs.push(
      bridge.engine.onState((s) => set({ engine: { ...get().engine, ...s } }))
    );
    unsubs.push(
      bridge.engine.onLog(() => {
        // state events already carry the trimmed log; keep a no-op hook for parity
      })
    );
    unsubs.push(
      bridge.engine.onHistory(async () => {
        const h = await bridge.store.get('history', []);
        set({ history: h });
      })
    );
    // Automatic update-check result (pushed from main on startup).
    unsubs.push(
      bridge.updater.onInfo((info) => set({ updateInfo: info }))
    );

    const initialEngine = await bridge.engine.getState();

    set({
      settings,
      profiles,
      macros,
      history: history || [],
      engine: { ...get().engine, ...initialEngine },
      hydrated: true,
      _unsubs: unsubs,
    });
  },

  // ---- settings ----
  setSetting(key, value) {
    const settings = { ...get().settings, [key]: value };
    set({ settings });
    bridge.store.set('settings', settings);
  },

  // ---- profiles ----
  getActiveProfile() {
    const { profiles, settings } = get();
    return profiles.find((p) => p.id === settings.activeProfileId) || profiles[0];
  },

  setActiveProfile(id) {
    get().setSetting('activeProfileId', id);
  },

  _persistProfiles(profiles) {
    set({ profiles });
    bridge.store.set('profiles', profiles);
  },

  updateProfile(id, patch) {
    const profiles = get().profiles.map((p) => (p.id === id ? { ...p, ...patch } : p));
    get()._persistProfiles(profiles);
  },

  addCustomProfile(name) {
    const id = `custom-${uid()}`;
    const profile = {
      id,
      name: name || 'Custom Profile',
      icon: '🛠️',
      accent: '#5cffb6',
      macroName: `${name || 'Custom'} Macro`,
      loopSettings: { mode: 'count', loops: 10 },
      delayPreset: 'average',
      delays: { ...DELAY_PRESETS.average },
      webhook: {
        enabled: false, url: '', username: 'Shadow Macro', avatarUrl: '',
        sessionSummary: true, runtimeReports: true, runtimeReportMinutes: 15,
        completionReports: false, errorNotifications: true,
      },
    };
    const profiles = [...get().profiles, profile];
    get()._persistProfiles(profiles);
    // seed a macro for the new profile
    const macros = { ...get().macros, [id]: defaultMacro(profile.macroName, id) };
    set({ macros });
    bridge.store.set('macros', macros);
    return id;
  },

  removeProfile(id) {
    const profiles = get().profiles.filter((p) => p.id !== id);
    const macros = { ...get().macros };
    delete macros[id];
    get()._persistProfiles(profiles);
    set({ macros });
    bridge.store.set('macros', macros);
    if (get().settings.activeProfileId === id && profiles[0]) {
      get().setActiveProfile(profiles[0].id);
    }
  },

  // ---- macros ----
  getMacro(profileId) {
    const id = profileId || get().getActiveProfile()?.id;
    return get().macros[id] || null;
  },

  saveMacro(profileId, macro) {
    const id = profileId || get().getActiveProfile()?.id;
    const macros = { ...get().macros, [id]: macro };
    set({ macros });
    bridge.store.set('macros', macros);
    // keep profile.macroName in sync
    if (macro.name) get().updateProfile(id, { macroName: macro.name });
  },

  // ---- engine controls ----
  startMacro() { bridge.engine.start(); },
  pauseMacro() { bridge.engine.pause(); },
  resumeMacro() { bridge.engine.resume(); },
  stopMacro() { bridge.engine.stop(); },

  // ---- run history ----
  setRunCoins(id, coins) {
    const history = get().history.map((r) => (r.id === id ? { ...r, coins } : r));
    set({ history });
    bridge.store.set('history', history);
  },
  deleteRun(id) {
    const history = get().history.filter((r) => r.id !== id);
    set({ history });
    bridge.store.set('history', history);
  },
  clearHistory() {
    set({ history: [] });
    bridge.store.set('history', []);
  },

  // ---- stats ----
  getStats() {
    const h = get().history;
    const totalRuntimeMs = h.reduce((a, r) => a + (r.durationMs || 0), 0);
    const totalRuns = h.length;
    const totalLoops = h.reduce((a, r) => a + (r.loops || 0), 0);
    const longestMs = h.reduce((a, r) => Math.max(a, r.durationMs || 0), 0);
    const counts = {};
    h.forEach((r) => { if (r.macro) counts[r.macro] = (counts[r.macro] || 0) + 1; });
    const mostUsed = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    const totalCoins = h.reduce((a, r) => a + (Number(r.coins) || 0), 0);
    const successes = h.filter((r) => r.status === 'success').length;
    return { totalRuntimeMs, totalRuns, totalLoops, longestMs, mostUsed, totalCoins, successes };
  },

  // ---- webhook ----
  async testWebhook(profile) {
    return bridge.webhook.test(profile);
  },

  // ---- updater ----
  async checkUpdates() {
    const info = await bridge.updater.check();
    set({ updateInfo: info });
    return info;
  },
}));
