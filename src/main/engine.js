// Core macro execution engine (main process).
//
// This is the real run loop that drives Shadow Macro. It steps through a
// macro's enabled stages and steps, honoring the active profile's delays and
// loop settings, supports pause/resume/stop, records run history, and fires
// webhook reports. Actual OS input dispatch is delegated to an injectable
// "input driver" — by default a no-op/logging driver (mock) so the engine is
// fully functional without sending real keystrokes. Swap the driver to enable
// real automation.

import { EventEmitter } from 'node:events';
import * as store from './store.js';
import { webhook } from './webhook.js';
import { inputDriver } from './inputDriver.js';

const STATUS = {
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  PAUSED: 'paused',
};

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Short human label for a step (used in live state / logs).
function stepLabel(step) {
  switch (step.type) {
    case 'click': return `Click @ (${step.x}, ${step.y})`;
    case 'move': return `Move (${step.x}, ${step.y})`;
    case 'key': return `Key [${step.key}]`;
    case 'text': return `Type text`;
    case 'scroll': return `Scroll`;
    case 'wait': return `Wait ${step.ms}ms`;
    default: return step.value || step.action || 'Action';
  }
}

export class MacroEngine extends EventEmitter {
  constructor(driver = inputDriver) {
    super();
    this.driver = driver;
    this.state = this._idleState();
    this._abort = false;
    this._pauseGate = null; // resolves when resumed
    this._tickTimer = null;
    this._runtimeReportTimer = null;
    this._lastReportAt = 0;
  }

  _idleState() {
    return {
      status: STATUS.IDLE,
      countdown: 0,
      elapsedMs: 0,
      loopsCompleted: 0,
      currentStageId: null,
      currentStep: null,
      currentMacroName: '',
      profileId: null,
      profileName: '',
      sessionStartedAt: null,
      testMode: false,
      log: [],
    };
  }

  getState() {
    return { ...this.state, log: this.state.log.slice(-200) };
  }

  _emit() {
    this.emit('state', this.getState());
  }

  _log(msg) {
    const entry = { t: new Date().toLocaleTimeString(), msg };
    this.state.log.push(entry);
    if (this.state.log.length > 400) this.state.log.shift();
    this.emit('log', entry);
  }

  _sleep(ms) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (this._abort) return resolve();
        // honor pause: extend by waiting on the gate
        if (this._pauseGate) {
          this._pauseGate.then(() => {
            const remaining = ms - (Date.now() - start);
            this._sleep(Math.max(remaining, 0)).then(resolve);
          });
          return;
        }
        if (Date.now() - start >= ms) return resolve();
        setTimeout(check, Math.min(50, ms));
      };
      check();
    });
  }

  async _waitIfPaused() {
    if (this._pauseGate) await this._pauseGate;
  }

  _activeProfile() {
    const profiles = store.get('profiles', []);
    const activeId = store.get('settings', {}).activeProfileId;
    return profiles.find((p) => p.id === activeId) || profiles[0] || null;
  }

  _macroFor(profile) {
    const macros = store.get('macros', {});
    // macros keyed by profile id; fall back to a default generated structure
    return macros[profile?.id] || null;
  }

  // ---- public controls -----------------------------------------------------

  async start() {
    if (this.state.status === STATUS.PAUSED) return this.resume();
    if (this.state.status !== STATUS.IDLE) return;

    const settings = store.get('settings', {});
    const profile = this._activeProfile();
    if (!profile) {
      this._log('No active profile configured.');
      return;
    }

    this._abort = false;
    this._pauseGate = null;

    this.state = this._idleState();
    this.state.profileId = profile.id;
    this.state.profileName = profile.name;
    this.state.currentMacroName = profile.macroName || 'Macro';
    this.state.testMode = !!settings.testMode;
    this.state.sessionStartedAt = Date.now();

    const countdown = Number(settings.sessionCountdown) || 0;
    if (countdown > 0) {
      this.state.status = STATUS.COUNTDOWN;
      this.state.countdown = countdown;
      this._emit();
      for (let c = countdown; c > 0; c--) {
        this.state.countdown = c;
        this._emit();
        await this._sleep(1000);
        if (this._abort) return this._finish('stopped');
      }
    }

    this.state.status = STATUS.RUNNING;
    this.state.currentStageId = null;
    this._emit();
    this._log(`${this.state.testMode ? '[TEST MODE] ' : ''}Session started — profile "${profile.name}"`);

    this._startTicker();
    this._startRuntimeReports(profile);

    try {
      await this._runLoop(profile);
      this._finish(this._abort ? 'stopped' : 'success');
    } catch (err) {
      this._log(`Error: ${err.message}`);
      const wh = profile.webhook || {};
      if (wh.enabled && wh.errorNotifications) {
        webhook.sendError(profile, { error: err.message, state: this.getState() }).catch(() => {});
      }
      this._finish('failure');
    }
  }

  pause() {
    if (this.state.status !== STATUS.RUNNING) return;
    let release;
    this._pauseGate = new Promise((r) => (release = r));
    this._pauseGate._release = release;
    this.state.status = STATUS.PAUSED;
    this._log('Macro paused.');
    this._emit();
  }

  resume() {
    if (this.state.status !== STATUS.PAUSED) return;
    const gate = this._pauseGate;
    this._pauseGate = null;
    gate?._release?.();
    this.state.status = STATUS.RUNNING;
    this._log('Macro resumed.');
    this._emit();
  }

  stop() {
    if (this.state.status === STATUS.IDLE) return;
    this._abort = true;
    // release any pause so the loop can observe the abort
    if (this._pauseGate) {
      const gate = this._pauseGate;
      this._pauseGate = null;
      gate?._release?.();
    }
  }

  // ---- internal loop -------------------------------------------------------

  _startTicker() {
    clearInterval(this._tickTimer);
    let last = Date.now();
    this._tickTimer = setInterval(() => {
      if (this.state.status === STATUS.RUNNING) {
        const now = Date.now();
        this.state.elapsedMs += now - last;
        last = now;
        this._emit();
      } else {
        last = Date.now();
      }
    }, 1000);
  }

  _startRuntimeReports(profile) {
    clearInterval(this._runtimeReportTimer);
    const wh = profile.webhook || {};
    if (!wh.enabled || !wh.runtimeReports) return;
    const intervalMs = (Number(wh.runtimeReportMinutes) || 15) * 60 * 1000;
    this._runtimeReportTimer = setInterval(() => {
      if (this.state.status === STATUS.RUNNING) {
        webhook.sendRuntimeReport(profile, this.getState()).catch(() => {});
      }
    }, intervalMs);
  }

  _enabledStages(macro) {
    if (!macro?.stages) return [];
    return macro.stages.filter((s) => s.enabled && s.steps.some((st) => st.enabled));
  }

  async _runLoop(profile) {
    const macro = this._macroFor(profile);
    const stages = this._enabledStages(macro);
    const loopSettings = profile.loopSettings || { mode: 'infinite' };
    const delays = profile.delays || { actionDelay: 300, clickDelay: 140, loadBuffer: 3000 };

    if (stages.length === 0) {
      this._log('Macro has no enabled stages — nothing to run.');
      return;
    }

    const timeLimitMs = loopSettings.mode === 'time' ? (Number(loopSettings.minutes) || 60) * 60000 : null;

    while (!this._abort) {
      // loop-mode termination checks
      if (loopSettings.mode === 'count' && this.state.loopsCompleted >= Number(loopSettings.loops || 1)) break;
      if (timeLimitMs && this.state.elapsedMs >= timeLimitMs) break;

      // run one full loop = all enabled stages in order
      for (const stage of stages) {
        if (this._abort) break;
        await this._waitIfPaused();
        this.state.currentStageId = stage.stageId;
        this._emit();

        for (const step of stage.steps.filter((s) => s.enabled)) {
          if (this._abort) break;
          await this._waitIfPaused();
          const repeat = Math.max(1, Number(step.repeat) || 1);
          for (let r = 0; r < repeat; r++) {
            if (this._abort) break;
            this.state.currentStep = stepLabel(step);
            this._emit();
            await this.driver.perform(step, {
              profile,
              stageId: stage.stageId,
              testMode: this.state.testMode,
              clickDelay: this.state.testMode ? Math.min(delays.clickDelay, 40) : delays.clickDelay,
              log: (m) => this._log(m),
            });
            // Wait steps already consumed their own time inside the driver.
            if (step.type !== 'wait') {
              const after = step.delayAfter != null
                ? Number(step.delayAfter)
                : (this.state.testMode ? Math.min(delays.actionDelay, 60) : delays.actionDelay);
              await this._sleep(after);
            }
          }
        }

        // buffer between stages (e.g. loading screens)
        if (!this._abort) await this._sleep(this.state.testMode ? 120 : delays.loadBuffer);
      }

      if (this._abort) break;
      this.state.loopsCompleted += 1;
      this._log(`Loop ${this.state.loopsCompleted} completed.`);
      this._emit();

      const wh = profile.webhook || {};
      if (wh.enabled && wh.completionReports) {
        webhook.sendCompletion(profile, this.getState()).catch(() => {});
      }
    }
  }

  _finish(status) {
    clearInterval(this._tickTimer);
    clearInterval(this._runtimeReportTimer);
    this._tickTimer = null;
    this._runtimeReportTimer = null;

    const finalStatus =
      status === 'success' ? 'success' : status === 'failure' ? 'failure' : 'stopped';

    // record run history
    const record = {
      id: uid(),
      startedAt: this.state.sessionStartedAt,
      dateTime: new Date(this.state.sessionStartedAt || Date.now()).toISOString(),
      macro: this.state.currentMacroName,
      profileId: this.state.profileId,
      profileName: this.state.profileName,
      durationMs: this.state.elapsedMs,
      loops: this.state.loopsCompleted,
      coins: null,
      status: finalStatus,
      testMode: this.state.testMode,
    };

    if (!this.state.testMode) {
      const history = [record, ...store.get('history', [])].slice(0, 2000);
      store.set('history', history);
      this.emit('history', record);
    }

    this._log(`Session ended (${finalStatus}).`);

    // session summary webhook
    const profile = this._activeProfile();
    const wh = profile?.webhook || {};
    if (wh.enabled && wh.sessionSummary) {
      webhook.sendSessionSummary(profile, record).catch(() => {});
    }

    this.state.status = STATUS.IDLE;
    this.state.currentStageId = null;
    this.state.currentStep = null;
    this.state.countdown = 0;
    this._emit();
  }
}

export const engine = new MacroEngine();
