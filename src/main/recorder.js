// Live input recorder (main process).
//
// Captures global mouse clicks, key presses and (optionally) movements using
// uiohook-napi and converts them into macro steps, inserting realistic "wait"
// gaps based on the time between inputs. Emits 'step' as each input is captured
// and 'stopped' with the full list. Degrades gracefully if the native hook is
// unavailable.

import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

// CommonJS require so the native module resolves from asar.unpacked at runtime.
const require = createRequire(import.meta.url);

let uIOhook = null;
let UiohookKey = null;
let hookLoaded = false;
let hookAvailable = false;

async function loadHook() {
  if (hookLoaded) return hookAvailable;
  hookLoaded = true;
  try {
    const mod = require('uiohook-napi');
    uIOhook = mod.uIOhook;
    UiohookKey = mod.UiohookKey;
    hookAvailable = true;
  } catch {
    hookAvailable = false;
  }
  return hookAvailable;
}

// Reverse map uiohook keycodes → readable key names.
function keycodeToName(keycode) {
  if (!UiohookKey) return String(keycode);
  for (const [name, code] of Object.entries(UiohookKey)) {
    if (code === keycode) return name;
  }
  return String(keycode);
}

function normalizeKeyName(name) {
  const map = {
    Ctrl: 'ctrl', CtrlRight: 'ctrl', Alt: 'alt', AltRight: 'alt',
    Shift: 'shift', ShiftRight: 'shift', Meta: 'meta', MetaRight: 'meta',
    Space: 'space', Enter: 'enter', Escape: 'esc', Tab: 'tab', Backspace: 'backspace',
  };
  if (map[name]) return map[name];
  if (/^[A-Z]$/.test(name)) return name.toLowerCase();
  const num = name.match(/^(\d)$/);
  if (num) return num[1];
  const f = name.match(/^F(\d{1,2})$/);
  if (f) return `f${f[1]}`;
  return name.toLowerCase();
}

class Recorder extends EventEmitter {
  constructor() {
    super();
    this.recording = false;
    this.steps = [];
    this.lastEventAt = 0;
    this.captureMoves = false;
    this._handlers = null;
    this._seq = 0;
  }

  async isAvailable() {
    return loadHook();
  }

  _id() {
    this._seq += 1;
    return `rec-${Date.now()}-${this._seq}`;
  }

  _pushWaitGap() {
    if (!this.lastEventAt) {
      this.lastEventAt = Date.now();
      return;
    }
    const now = Date.now();
    const gap = now - this.lastEventAt;
    this.lastEventAt = now;
    // Insert a wait step for meaningful gaps (>120ms) so playback feels human.
    if (gap > 120) {
      const step = { id: this._id(), type: 'wait', enabled: true, repeat: 1, ms: Math.min(gap, 60000), value: '', delayAfter: 0 };
      this.steps.push(step);
      this.emit('step', step);
    }
  }

  _add(step) {
    this.steps.push(step);
    this.emit('step', step);
  }

  async start(options = {}) {
    if (this.recording) return { ok: false, reason: 'already-recording' };
    const ok = await loadHook();
    if (!ok) return { ok: false, reason: 'unavailable' };

    this.recording = true;
    this.captureMoves = !!options.captureMoves;
    this.steps = [];
    this.lastEventAt = 0;
    this._seq = 0;

    const onMouseDown = (e) => {
      if (!this.recording) return;
      this._pushWaitGap();
      const button = e.button === 2 ? 'right' : e.button === 3 ? 'middle' : 'left';
      this._add({ id: this._id(), type: 'click', enabled: true, repeat: 1, x: e.x, y: e.y, button, value: '', delayAfter: 0 });
    };
    const onWheel = (e) => {
      if (!this.recording) return;
      this._pushWaitGap();
      const amount = e.rotation ? -e.rotation : (e.direction === 3 ? -3 : 3);
      this._add({ id: this._id(), type: 'scroll', enabled: true, repeat: 1, amount, value: '', delayAfter: 0 });
    };
    const onKeyDown = (e) => {
      if (!this.recording) return;
      const name = normalizeKeyName(keycodeToName(e.keycode));
      // ignore lone modifier presses (they'll combine on the next key in editing)
      this._pushWaitGap();
      this._add({ id: this._id(), type: 'key', enabled: true, repeat: 1, key: name, value: '', delayAfter: 0 });
    };

    this._handlers = { onMouseDown, onWheel, onKeyDown };
    uIOhook.on('mousedown', onMouseDown);
    uIOhook.on('wheel', onWheel);
    uIOhook.on('keydown', onKeyDown);

    try {
      uIOhook.start();
    } catch (err) {
      this.recording = false;
      return { ok: false, reason: err.message };
    }
    return { ok: true };
  }

  stop() {
    if (!this.recording) return { ok: false, steps: [] };
    this.recording = false;
    try {
      if (this._handlers) {
        uIOhook.off('mousedown', this._handlers.onMouseDown);
        uIOhook.off('wheel', this._handlers.onWheel);
        uIOhook.off('keydown', this._handlers.onKeyDown);
      }
      uIOhook.stop();
    } catch {}
    this._handlers = null;
    const steps = this.steps;
    this.emit('stopped', steps);
    return { ok: true, steps };
  }
}

export const recorder = new Recorder();
