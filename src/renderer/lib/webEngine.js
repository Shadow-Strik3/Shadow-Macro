// Browser-side engine used only by the web preview (no Electron). Mirrors the
// behavior and event surface of the real main-process engine in src/main/engine.js
// so the renderer code path is identical in both environments.

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function webStepLabel(step) {
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

export class WebEngine {
  constructor(store) {
    this.store = store;
    this.listeners = { state: new Set(), log: new Set(), history: new Set() };
    this.state = this._idle();
    this._abort = false;
    this._paused = false;
    this._timer = null;
  }

  _idle() {
    return {
      status: 'idle', countdown: 0, elapsedMs: 0, loopsCompleted: 0,
      currentStageId: null, currentStep: null, currentMacroName: '',
      profileId: null, profileName: '', sessionStartedAt: null, testMode: false, log: [],
    };
  }

  on(evt, cb) {
    this.listeners[evt].add(cb);
    return () => this.listeners[evt].delete(cb);
  }
  _fire(evt, payload) {
    this.listeners[evt].forEach((cb) => cb(payload));
  }
  getState() {
    return { ...this.state, log: this.state.log.slice(-200) };
  }
  _emit() {
    this._fire('state', this.getState());
  }
  _log(msg) {
    const e = { t: new Date().toLocaleTimeString(), msg };
    this.state.log.push(e);
    if (this.state.log.length > 400) this.state.log.shift();
    this._fire('log', e);
  }

  _activeProfile() {
    const profiles = this.store.get('profiles', []);
    const id = this.store.get('settings', {}).activeProfileId;
    return profiles.find((p) => p.id === id) || profiles[0] || null;
  }
  _macro(profile) {
    const macros = this.store.get('macros', {});
    return macros[profile?.id] || null;
  }

  async start() {
    if (this.state.status === 'paused') return this.resume();
    if (this.state.status !== 'idle') return;
    const settings = this.store.get('settings', {});
    const profile = this._activeProfile();
    if (!profile) return this._log('No active profile configured.');

    this._abort = false;
    this._paused = false;
    this.state = this._idle();
    this.state.profileId = profile.id;
    this.state.profileName = profile.name;
    this.state.currentMacroName = profile.macroName || 'Macro';
    this.state.testMode = !!settings.testMode;
    this.state.sessionStartedAt = Date.now();

    const countdown = Number(settings.sessionCountdown) || 0;
    if (countdown > 0) {
      this.state.status = 'countdown';
      for (let c = countdown; c > 0; c--) {
        if (this._abort) return this._finish('stopped');
        this.state.countdown = c;
        this._emit();
        await this._sleep(1000);
      }
    }
    this.state.status = 'running';
    this.state.countdown = 0;
    this._emit();
    this._log(`${this.state.testMode ? '[TEST MODE] ' : ''}Session started — profile "${profile.name}"`);

    this._startTicker();
    try {
      await this._runLoop(profile);
      this._finish(this._abort ? 'stopped' : 'success');
    } catch (err) {
      this._log(`Error: ${err.message}`);
      this._finish('failure');
    }
  }

  pause() {
    if (this.state.status !== 'running') return;
    this._paused = true;
    this.state.status = 'paused';
    this._log('Macro paused.');
    this._emit();
  }
  resume() {
    if (this.state.status !== 'paused') return;
    this._paused = false;
    this.state.status = 'running';
    this._log('Macro resumed.');
    this._emit();
  }
  stop() {
    if (this.state.status === 'idle') return;
    this._abort = true;
    this._paused = false;
  }

  _sleep(ms) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (this._abort) return resolve();
        if (this._paused) return setTimeout(tick, 80);
        if (Date.now() - start >= ms) return resolve();
        setTimeout(tick, Math.min(50, ms));
      };
      tick();
    });
  }
  async _waitPause() {
    while (this._paused && !this._abort) await new Promise((r) => setTimeout(r, 80));
  }

  _startTicker() {
    clearInterval(this._timer);
    let last = Date.now();
    this._timer = setInterval(() => {
      if (this.state.status === 'running') {
        const now = Date.now();
        this.state.elapsedMs += now - last;
        last = now;
        this._emit();
      } else last = Date.now();
    }, 1000);
  }

  _enabledStages(macro) {
    if (!macro?.stages) return [];
    return macro.stages.filter((s) => s.enabled && s.steps.some((st) => st.enabled));
  }

  async _runLoop(profile) {
    const macro = this._macro(profile);
    const stages = this._enabledStages(macro);
    const loop = profile.loopSettings || { mode: 'infinite' };
    const delays = profile.delays || { actionDelay: 300, clickDelay: 140, loadBuffer: 3000 };
    if (!stages.length) return this._log('Macro has no enabled stages — nothing to run.');
    const timeLimit = loop.mode === 'time' ? (Number(loop.minutes) || 60) * 60000 : null;
    const test = this.state.testMode;

    while (!this._abort) {
      if (loop.mode === 'count' && this.state.loopsCompleted >= Number(loop.loops || 1)) break;
      if (timeLimit && this.state.elapsedMs >= timeLimit) break;

      for (const stage of stages) {
        if (this._abort) break;
        await this._waitPause();
        this.state.currentStageId = stage.stageId;
        this._emit();
        for (const step of stage.steps.filter((s) => s.enabled)) {
          if (this._abort) break;
          await this._waitPause();
          const repeat = Math.max(1, Number(step.repeat) || 1);
          for (let r = 0; r < repeat; r++) {
            if (this._abort) break;
            const label = webStepLabel(step);
            this.state.currentStep = label;
            this._log(`↳ ${label} (preview — no real input)`);
            this._emit();
            if (step.type === 'wait') {
              await this._sleep(test ? Math.min(Number(step.ms) || 0, 100) : Number(step.ms) || 0);
            } else {
              await this._sleep(test ? Math.min(delays.clickDelay, 40) : delays.clickDelay);
              const after = step.delayAfter != null
                ? Number(step.delayAfter)
                : (test ? Math.min(delays.actionDelay, 60) : delays.actionDelay);
              await this._sleep(after);
            }
          }
        }
        if (!this._abort) await this._sleep(test ? 150 : delays.loadBuffer);
      }
      if (this._abort) break;
      this.state.loopsCompleted += 1;
      this._log(`Loop ${this.state.loopsCompleted} completed.`);
      this._emit();
    }
  }

  _finish(status) {
    clearInterval(this._timer);
    this._timer = null;
    const finalStatus = status === 'success' ? 'success' : status === 'failure' ? 'failure' : 'stopped';
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
      const history = [record, ...this.store.get('history', [])].slice(0, 2000);
      this.store.set('history', history);
      this._fire('history', record);
    }
    this._log(`Session ended (${finalStatus}).`);
    this.state.status = 'idle';
    this.state.currentStageId = null;
    this.state.currentStep = null;
    this.state.countdown = 0;
    this._emit();
  }
}
