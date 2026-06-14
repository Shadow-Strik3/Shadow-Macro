// Real OS input driver (main process).
//
// Executes a recorded step (click / move / key / text / wait / scroll / action)
// as actual mouse/keyboard input using @nut-tree-fork/nut-js. The native module
// is loaded lazily and guarded: if it isn't available (e.g. not installed, or a
// platform without the native binary), the driver degrades to a logging "mock"
// so the engine still runs end-to-end without crashing.

import { createRequire } from 'node:module';

// Use CommonJS require so Electron's asar → asar.unpacked redirect resolves the
// native module at runtime (dynamic import() does not perform that redirect).
const require = createRequire(import.meta.url);

let nut = null;
let nutLoaded = false;
let nutAvailable = false;

async function loadNut() {
  if (nutLoaded) return nutAvailable;
  nutLoaded = true;
  try {
    nut = require('@nut-tree-fork/nut-js');
    // configure: no auto-delays; the engine controls timing
    nut.mouse.config.autoDelayMs = 0;
    nut.keyboard.config.autoDelayMs = 0;
    nutAvailable = true;
  } catch (err) {
    nutAvailable = false;
  }
  return nutAvailable;
}

// Map a human key string ("e", "ctrl+a", "space", "f5") to nut Key enums.
function resolveKeys(nutMod, combo) {
  const { Key } = nutMod;
  const ALIASES = {
    ctrl: Key.LeftControl, control: Key.LeftControl,
    alt: Key.LeftAlt, shift: Key.LeftShift,
    cmd: Key.LeftSuper, meta: Key.LeftSuper, win: Key.LeftSuper, super: Key.LeftSuper,
    esc: Key.Escape, escape: Key.Escape,
    enter: Key.Enter, return: Key.Enter,
    space: Key.Space, spacebar: Key.Space,
    tab: Key.Tab, backspace: Key.Backspace, delete: Key.Delete, del: Key.Delete,
    up: Key.Up, down: Key.Down, left: Key.Left, right: Key.Right,
    home: Key.Home, end: Key.End, pageup: Key.PageUp, pagedown: Key.PageDown,
  };
  return String(combo)
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      if (ALIASES[part]) return ALIASES[part];
      if (part.length === 1) {
        const upper = part.toUpperCase();
        if (Key[upper] !== undefined) return Key[upper]; // letters A-Z
        const digitName = { 0: 'Num0', 1: 'Num1', 2: 'Num2', 3: 'Num3', 4: 'Num4', 5: 'Num5', 6: 'Num6', 7: 'Num7', 8: 'Num8', 9: 'Num9' }[part];
        if (digitName && Key[digitName] !== undefined) return Key[digitName];
      }
      const fkey = part.match(/^f(\d{1,2})$/);
      if (fkey && Key[`F${fkey[1]}`] !== undefined) return Key[`F${fkey[1]}`];
      const cap = part.charAt(0).toUpperCase() + part.slice(1);
      return Key[cap] !== undefined ? Key[cap] : null;
    })
    .filter((k) => k !== null);
}

function resolveButton(nutMod, btn) {
  const { Button } = nutMod;
  if (btn === 'right') return Button.RIGHT;
  if (btn === 'middle') return Button.MIDDLE;
  return Button.LEFT;
}

export const inputDriver = {
  async isAvailable() {
    return loadNut();
  },

  // Execute one step. ctx = { log, clickDelay, profile, stageId, testMode }
  async perform(step, ctx) {
    const type = step.type || 'action';

    // In test mode we never send real input — just log.
    if (ctx.testMode) {
      ctx.log(`↳ [test] ${describe(step)}`);
      return true;
    }

    const ok = await loadNut();
    if (!ok) {
      // No native input available: log and continue (mock behavior).
      ctx.log(`↳ ${describe(step)} (mock — input driver unavailable)`);
      await delay(ctx.clickDelay);
      return true;
    }

    try {
      switch (type) {
        case 'move':
          await nut.mouse.setPosition(new nut.Point(num(step.x), num(step.y)));
          break;
        case 'click':
          await nut.mouse.setPosition(new nut.Point(num(step.x), num(step.y)));
          await delay(Math.min(ctx.clickDelay, 60));
          await nut.mouse.click(resolveButton(nut, step.button));
          break;
        case 'key': {
          const keys = resolveKeys(nut, step.key);
          if (keys.length) {
            await nut.keyboard.pressKey(...keys);
            await nut.keyboard.releaseKey(...keys);
          }
          break;
        }
        case 'text':
          if (step.text) await nut.keyboard.type(step.text);
          break;
        case 'scroll':
          if (num(step.amount) > 0) await nut.mouse.scrollUp(Math.abs(num(step.amount)));
          else await nut.mouse.scrollDown(Math.abs(num(step.amount)));
          break;
        case 'wait':
          await delay(num(step.ms));
          break;
        case 'action':
        default:
          // Labeled placeholder with no concrete input — log only.
          ctx.log(`↳ ${step.value || step.action || 'Action'} (no input recorded)`);
          await delay(ctx.clickDelay);
          return true;
      }
      ctx.log(`↳ ${describe(step)}`);
      await delay(ctx.clickDelay);
      return true;
    } catch (err) {
      ctx.log(`↳ ${describe(step)} — failed: ${err.message}`);
      return false;
    }
  },
};

function describe(step) {
  switch (step.type) {
    case 'click': return `Click ${step.button || 'left'} @ (${step.x}, ${step.y})${step.value ? ' — ' + step.value : ''}`;
    case 'move': return `Move to (${step.x}, ${step.y})`;
    case 'key': return `Press [${step.key}]`;
    case 'text': return `Type "${(step.text || '').slice(0, 24)}"`;
    case 'scroll': return `Scroll ${num(step.amount)}`;
    case 'wait': return `Wait ${num(step.ms)} ms`;
    default: return step.value || step.action || 'Action';
  }
}

const num = (v) => Number(v) || 0;
const delay = (ms) => new Promise((r) => setTimeout(r, Math.max(0, num(ms))));
