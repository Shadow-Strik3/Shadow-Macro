// Static TDS-specific data: delay presets, profile templates, and the macro
// stage taxonomy. These describe the structure the UI builds around.

import { newStep } from './steps.js';

export const DELAY_PRESETS = {
  fast: { id: 'fast', label: 'Fast PC', actionDelay: 120, clickDelay: 60, loadBuffer: 1500 },
  average: { id: 'average', label: 'Average PC', actionDelay: 300, clickDelay: 140, loadBuffer: 3000 },
  slow: { id: 'slow', label: 'Slow PC', actionDelay: 600, clickDelay: 280, loadBuffer: 6000 },
};

// The four-stage TDS macro structure. Each stage lists the action types that
// can be composed into a sequence.
export const MACRO_STAGES = [
  {
    id: 'lobby',
    name: 'Lobby Actions',
    icon: '🏛️',
    actions: ['Navigate lobby', 'Open elevators', 'Select map', 'Select difficulty'],
  },
  {
    id: 'loadout',
    name: 'Loadout Actions',
    icon: '🎒',
    actions: ['Equip towers', 'Equip consumables', 'Select preferred loadout'],
  },
  {
    id: 'match',
    name: 'Match Actions',
    icon: '⚔️',
    actions: ['Place towers', 'Upgrade towers', 'Sell towers', 'Activate abilities', 'Wait for wave timers'],
  },
  {
    id: 'end',
    name: 'End-of-Match Actions',
    icon: '🏁',
    actions: ['Return to lobby', 'Requeue', 'Restart sequence'],
  },
];

export const PROFILE_TYPES = [
  { id: 'solo', name: 'Solo Grinding', icon: '🧍', accent: '#7c5cff' },
  { id: 'event', name: 'Event Grinding', icon: '🎉', accent: '#ff5c8a' },
  { id: 'coin', name: 'Coin Farming', icon: '🪙', accent: '#ffb648' },
  { id: 'xp', name: 'XP Farming', icon: '⭐', accent: '#5cc8ff' },
  { id: 'custom', name: 'Custom Profile', icon: '🛠️', accent: '#5cffb6' },
];

function buildStages() {
  // Seed each stage with labeled "action" steps (no real input yet). Users then
  // record real clicks/keys or hand-edit these into concrete steps.
  return MACRO_STAGES.map((s) => ({
    stageId: s.id,
    enabled: true,
    steps: s.actions.map((a, i) => ({ ...newStep('action', { value: a }), id: `${s.id}-${i}` })),
  }));
}

export function defaultMacro(name, profileId) {
  return {
    id: profileId ? `macro-${profileId}` : `macro-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    stages: buildStages(),
    createdAt: new Date().toISOString(),
  };
}

export function defaultProfiles() {
  return PROFILE_TYPES.filter((p) => p.id !== 'custom').map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    accent: p.accent,
    macroName: `${p.name} Macro`,
    loopSettings: { mode: 'count', loops: 25 },
    delayPreset: 'average',
    delays: { ...DELAY_PRESETS.average },
    webhook: {
      enabled: false,
      url: '',
      username: 'Shadow Macro',
      avatarUrl: '',
      sessionSummary: true,
      runtimeReports: true,
      runtimeReportMinutes: 15,
      completionReports: false,
      errorNotifications: true,
    },
  }));
}
