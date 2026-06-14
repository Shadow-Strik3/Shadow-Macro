// Shared step schema for recorded macro steps.
//
// A step now describes a concrete, executable action instead of just a label.
// `type` selects the behavior; the other fields are type-specific. `value` is a
// free-text label/note shown in the UI for every step.

export const STEP_TYPES = {
  click: {
    id: 'click',
    label: 'Mouse Click',
    icon: '🖱️',
    fields: ['x', 'y', 'button'],
    summary: (s) => `Click ${s.button || 'left'} @ (${s.x ?? '?'}, ${s.y ?? '?'})`,
  },
  move: {
    id: 'move',
    label: 'Move Mouse',
    icon: '🎯',
    fields: ['x', 'y'],
    summary: (s) => `Move to (${s.x ?? '?'}, ${s.y ?? '?'})`,
  },
  key: {
    id: 'key',
    label: 'Key Press',
    icon: '⌨️',
    fields: ['key'],
    summary: (s) => `Press [${s.key || '?'}]`,
  },
  text: {
    id: 'text',
    label: 'Type Text',
    icon: '✍️',
    fields: ['text'],
    summary: (s) => `Type "${(s.text || '').slice(0, 24)}"`,
  },
  wait: {
    id: 'wait',
    label: 'Wait / Delay',
    icon: '⏳',
    fields: ['ms'],
    summary: (s) => `Wait ${s.ms ?? 0} ms`,
  },
  scroll: {
    id: 'scroll',
    label: 'Scroll',
    icon: '🖲️',
    fields: ['amount'],
    summary: (s) => `Scroll ${s.amount > 0 ? 'up' : 'down'} ${Math.abs(s.amount || 0)}`,
  },
  action: {
    id: 'action',
    label: 'Labeled Action',
    icon: '🏷️',
    fields: [],
    summary: (s) => s.value || 'Action',
  },
};

export function stepSummary(step) {
  const def = STEP_TYPES[step.type] || STEP_TYPES.action;
  const base = def.summary(step);
  return step.value && step.type !== 'action' ? `${base} — ${step.value}` : base;
}

let _seq = 0;
export function newStep(type = 'click', extra = {}) {
  _seq += 1;
  const base = {
    id: `s-${Date.now()}-${_seq}`,
    type,
    enabled: true,
    repeat: 1,
    delayAfter: null, // ms; null = use profile actionDelay
    value: '',
  };
  const defaults = {
    click: { x: 0, y: 0, button: 'left' },
    move: { x: 0, y: 0 },
    key: { key: '' },
    text: { text: '' },
    wait: { ms: 500 },
    scroll: { amount: -3 },
    action: {},
  };
  return { ...base, ...(defaults[type] || {}), ...extra };
}
