// Default seed data for the persistent store (main process). Kept in sync with
// the renderer's data/presets.js taxonomy.

export const DELAY_PRESETS = {
  fast: { id: 'fast', label: 'Fast PC', actionDelay: 120, clickDelay: 60, loadBuffer: 1500 },
  average: { id: 'average', label: 'Average PC', actionDelay: 300, clickDelay: 140, loadBuffer: 3000 },
  slow: { id: 'slow', label: 'Slow PC', actionDelay: 600, clickDelay: 280, loadBuffer: 6000 },
};

export const MACRO_STAGES = [
  { id: 'lobby', name: 'Lobby Actions', actions: ['Navigate lobby', 'Open elevators', 'Select map', 'Select difficulty'] },
  { id: 'loadout', name: 'Loadout Actions', actions: ['Equip towers', 'Equip consumables', 'Select preferred loadout'] },
  { id: 'match', name: 'Match Actions', actions: ['Place towers', 'Upgrade towers', 'Sell towers', 'Activate abilities', 'Wait for wave timers'] },
  { id: 'end', name: 'End-of-Match Actions', actions: ['Return to lobby', 'Requeue', 'Restart sequence'] },
];

export const PROFILE_TYPES = [
  { id: 'solo', name: 'Solo Grinding', icon: '🧍', accent: '#7c5cff' },
  { id: 'event', name: 'Event Grinding', icon: '🎉', accent: '#ff5c8a' },
  { id: 'coin', name: 'Coin Farming', icon: '🪙', accent: '#ffb648' },
  { id: 'xp', name: 'XP Farming', icon: '⭐', accent: '#5cc8ff' },
];

export const DEFAULT_SETTINGS = {
  launchOnStartup: false,
  startMinimizedToTray: false,
  closeToTray: true,
  sessionCountdown: 3,
  autoPauseResume: true,
  testMode: false,
  theme: 'dark',
  activeProfileId: 'solo',
  // Auto-update behavior
  autoUpdateEnabled: true,      // master toggle for automatic update checks
  autoUpdateCheckOnStartup: true, // check shortly after launch when enabled
};

export function defaultMacroStages() {
  return MACRO_STAGES.map((s) => ({
    stageId: s.id,
    enabled: true,
    steps: s.actions.map((a, i) => ({ id: `${s.id}-${i}`, action: a, enabled: true, repeat: 1 })),
  }));
}

export function defaultProfiles() {
  return PROFILE_TYPES.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    accent: p.accent,
    macroName: `${p.name} Macro`,
    loopSettings: { mode: 'count', loops: 25 },
    delayPreset: 'average',
    delays: { ...DELAY_PRESETS.average },
    webhook: {
      enabled: false, url: '', username: 'Shadow Macro', avatarUrl: '',
      sessionSummary: true, runtimeReports: true, runtimeReportMinutes: 15,
      completionReports: false, errorNotifications: true,
    },
  }));
}

export function defaultMacrosForProfiles(profiles) {
  const macros = {};
  for (const p of profiles) {
    macros[p.id] = { id: `macro-${p.id}`, name: p.macroName, stages: defaultMacroStages() };
  }
  return macros;
}
