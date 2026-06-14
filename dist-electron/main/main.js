import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);

// src/main/main.js
import { app as app3, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } from "electron";
import path3 from "node:path";
import { fileURLToPath } from "node:url";

// src/main/updater.js
import { app as app2 } from "electron";
import fs2 from "node:fs";
import path2 from "node:path";

// src/main/store.js
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
var FILES = {
  settings: "settings.json",
  profiles: "profiles.json",
  macros: "macros.json",
  history: "run-history.json"
};
var cache = {};
var writeTimers = {};
function userDataDir() {
  return app.getPath("userData");
}
function filePath(domain) {
  return path.join(userDataDir(), FILES[domain]);
}
function readRaw(domain, fallback) {
  try {
    const txt = fs.readFileSync(filePath(domain), "utf-8");
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}
function writeAtomic(domain) {
  const fp = filePath(domain);
  const tmp = `${fp}.tmp`;
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(cache[domain], null, 2), "utf-8");
    fs.renameSync(tmp, fp);
  } catch (err) {
    console.error(`[store] failed to write ${domain}:`, err);
  }
}
function scheduleWrite(domain) {
  clearTimeout(writeTimers[domain]);
  writeTimers[domain] = setTimeout(() => writeAtomic(domain), 200);
}
function get(domain, fallback) {
  if (!(domain in cache)) cache[domain] = readRaw(domain, fallback);
  return cache[domain];
}
function set(domain, value) {
  cache[domain] = value;
  scheduleWrite(domain);
  return value;
}
function flushAll() {
  for (const domain of Object.keys(FILES)) {
    clearTimeout(writeTimers[domain]);
    if (domain in cache) writeAtomic(domain);
  }
}
var STORE_FILES = FILES;

// src/main/updater.js
var CURRENT_VERSION = app2?.getVersion?.() || "1.0.0";
var GITHUB_REPO = process.env.SHADOW_GITHUB_REPO || null;
var UPDATE_FEED_URL = process.env.SHADOW_UPDATE_FEED || null;
function cleanVersion(v) {
  return String(v || "").trim().replace(/^v/i, "");
}
function semverGt(a, b) {
  const pa = cleanVersion(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = cleanVersion(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}
function upToDate(extra = {}) {
  return {
    currentVersion: CURRENT_VERSION,
    latestVersion: CURRENT_VERSION,
    available: false,
    notes: "You are running the latest version of Shadow Macro.",
    downloadUrl: null,
    releaseUrl: null,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...extra
  };
}
async function checkGenericFeed() {
  const res = await fetch(UPDATE_FEED_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const feed = await res.json();
  const available = semverGt(feed.version, CURRENT_VERSION);
  return {
    currentVersion: CURRENT_VERSION,
    latestVersion: cleanVersion(feed.version),
    available,
    notes: feed.notes || (available ? `Version ${feed.version} is available.` : "You are up to date."),
    downloadUrl: feed.url || null,
    releaseUrl: feed.url || null,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function checkGitHub() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Shadow-Macro-Updater"
    }
  });
  if (res.status === 404) {
    return upToDate({ notes: "No published releases found yet." });
  }
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
  const rel = await res.json();
  const latest = cleanVersion(rel.tag_name || rel.name);
  const available = semverGt(latest, CURRENT_VERSION);
  const exeAsset = (rel.assets || []).find((a) => /\.exe$/i.test(a.name));
  const downloadUrl = exeAsset ? exeAsset.browser_download_url : rel.html_url;
  return {
    currentVersion: CURRENT_VERSION,
    latestVersion: latest || CURRENT_VERSION,
    available,
    notes: available ? rel.body?.slice(0, 500) || `Shadow Macro v${latest} is available.` : "You are running the latest version of Shadow Macro.",
    downloadUrl,
    releaseUrl: rel.html_url || null,
    publishedAt: rel.published_at || null,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function checkForUpdates() {
  try {
    if (UPDATE_FEED_URL) return await checkGenericFeed();
    if (GITHUB_REPO) return await checkGitHub();
    await new Promise((r) => setTimeout(r, 300));
    return upToDate({ notes: "Auto-update source not configured yet." });
  } catch (err) {
    return {
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      available: false,
      notes: `Update check failed: ${err.message}`,
      downloadUrl: null,
      releaseUrl: null,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
}
async function backupBeforeUpdate() {
  flushAll();
  const userData = userDataDir();
  const backupDir = path2.join(userData, "backups", `backup-${Date.now()}`);
  fs2.mkdirSync(backupDir, { recursive: true });
  const copied = [];
  for (const name of Object.values(STORE_FILES)) {
    const src = path2.join(userData, name);
    if (fs2.existsSync(src)) {
      fs2.copyFileSync(src, path2.join(backupDir, name));
      copied.push(name);
    }
  }
  try {
    const root = path2.join(userData, "backups");
    const dirs = fs2.readdirSync(root).filter((d) => d.startsWith("backup-")).sort();
    while (dirs.length > 20) {
      const old = dirs.shift();
      fs2.rmSync(path2.join(root, old), { recursive: true, force: true });
    }
  } catch {
  }
  return { backupDir, copied, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
}

// src/main/engine.js
import { EventEmitter } from "node:events";

// src/main/webhook.js
function fmtDuration(ms = 0) {
  const s = Math.floor(ms / 1e3);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function runsPerHour(elapsedMs, loops) {
  if (!elapsedMs || !loops) return 0;
  return loops / (elapsedMs / 36e5);
}
var COLORS = {
  purple: 8150271,
  blue: 6080767,
  green: 4905361,
  amber: 16758344,
  red: 16735340
};
async function post(url, payload) {
  if (!url || !/^https?:\/\//.test(url)) return { ok: false, reason: "no-url" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error("[webhook] send failed:", err.message);
    return { ok: false, reason: err.message };
  }
}
function baseEnvelope(profile, embed) {
  const wh = profile.webhook || {};
  const payload = { embeds: [embed] };
  if (wh.username) payload.username = wh.username;
  if (wh.avatarUrl) payload.avatar_url = wh.avatarUrl;
  return payload;
}
function footer() {
  return { text: "Shadow Macro \xB7 TDS Suite" };
}
var webhook = {
  async test(profile) {
    const wh = profile.webhook || {};
    const embed = {
      title: "\u{1F6E1}\uFE0F Shadow Macro \u2014 Webhook Connected",
      description: `Webhook for **${profile.name}** is working correctly.`,
      color: COLORS.purple,
      footer: footer(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return post(wh.url, baseEnvelope(profile, embed));
  },
  async sendSessionSummary(profile, record) {
    const wh = profile.webhook || {};
    const rph = runsPerHour(record.durationMs, record.loops);
    const statusEmoji = record.status === "success" ? "\u2705" : record.status === "failure" ? "\u274C" : "\u23F9\uFE0F";
    const embed = {
      title: `\u{1F4CA} Session Summary \xB7 ${profile.name}`,
      color: record.status === "failure" ? COLORS.red : COLORS.green,
      fields: [
        { name: "Macro", value: record.macro || "\u2014", inline: true },
        { name: "Status", value: `${statusEmoji} ${record.status}`, inline: true },
        { name: "\u200B", value: "\u200B", inline: true },
        { name: "Runtime", value: fmtDuration(record.durationMs), inline: true },
        { name: "Loops", value: String(record.loops || 0), inline: true },
        { name: "Runs / Hour", value: rph ? rph.toFixed(1) : "\u2014", inline: true }
      ],
      footer: footer(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return post(wh.url, baseEnvelope(profile, embed));
  },
  async sendRuntimeReport(profile, state) {
    const wh = profile.webhook || {};
    const rph = runsPerHour(state.elapsedMs, state.loopsCompleted);
    const embed = {
      title: `\u23F1\uFE0F Runtime Report \xB7 ${profile.name}`,
      color: COLORS.blue,
      fields: [
        { name: "Elapsed", value: fmtDuration(state.elapsedMs), inline: true },
        { name: "Loops", value: String(state.loopsCompleted || 0), inline: true },
        { name: "Runs / Hour", value: rph ? rph.toFixed(1) : "\u2014", inline: true }
      ],
      footer: footer(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return post(wh.url, baseEnvelope(profile, embed));
  },
  async sendCompletion(profile, state) {
    const wh = profile.webhook || {};
    const embed = {
      title: `\u{1F3C1} Loop Completed \xB7 ${profile.name}`,
      description: `Loop **#${state.loopsCompleted}** finished.`,
      color: COLORS.amber,
      fields: [
        { name: "Total Loops", value: String(state.loopsCompleted || 0), inline: true },
        { name: "Elapsed", value: fmtDuration(state.elapsedMs), inline: true }
      ],
      footer: footer(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return post(wh.url, baseEnvelope(profile, embed));
  },
  async sendError(profile, { error, state }) {
    const wh = profile.webhook || {};
    const embed = {
      title: `\u26A0\uFE0F Error \xB7 ${profile.name}`,
      description: `\`\`\`${String(error).slice(0, 500)}\`\`\``,
      color: COLORS.red,
      fields: [
        { name: "Elapsed", value: fmtDuration(state?.elapsedMs || 0), inline: true },
        { name: "Loops", value: String(state?.loopsCompleted || 0), inline: true }
      ],
      footer: footer(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return post(wh.url, baseEnvelope(profile, embed));
  }
};

// src/main/inputDriver.js
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var nut = null;
var nutLoaded = false;
var nutAvailable = false;
async function loadNut() {
  if (nutLoaded) return nutAvailable;
  nutLoaded = true;
  try {
    nut = require2("@nut-tree-fork/nut-js");
    nut.mouse.config.autoDelayMs = 0;
    nut.keyboard.config.autoDelayMs = 0;
    nutAvailable = true;
  } catch (err) {
    nutAvailable = false;
  }
  return nutAvailable;
}
function resolveKeys(nutMod, combo) {
  const { Key } = nutMod;
  const ALIASES = {
    ctrl: Key.LeftControl,
    control: Key.LeftControl,
    alt: Key.LeftAlt,
    shift: Key.LeftShift,
    cmd: Key.LeftSuper,
    meta: Key.LeftSuper,
    win: Key.LeftSuper,
    super: Key.LeftSuper,
    esc: Key.Escape,
    escape: Key.Escape,
    enter: Key.Enter,
    return: Key.Enter,
    space: Key.Space,
    spacebar: Key.Space,
    tab: Key.Tab,
    backspace: Key.Backspace,
    delete: Key.Delete,
    del: Key.Delete,
    up: Key.Up,
    down: Key.Down,
    left: Key.Left,
    right: Key.Right,
    home: Key.Home,
    end: Key.End,
    pageup: Key.PageUp,
    pagedown: Key.PageDown
  };
  return String(combo).split("+").map((p) => p.trim().toLowerCase()).filter(Boolean).map((part) => {
    if (ALIASES[part]) return ALIASES[part];
    if (part.length === 1) {
      const upper = part.toUpperCase();
      if (Key[upper] !== void 0) return Key[upper];
      const digitName = { 0: "Num0", 1: "Num1", 2: "Num2", 3: "Num3", 4: "Num4", 5: "Num5", 6: "Num6", 7: "Num7", 8: "Num8", 9: "Num9" }[part];
      if (digitName && Key[digitName] !== void 0) return Key[digitName];
    }
    const fkey = part.match(/^f(\d{1,2})$/);
    if (fkey && Key[`F${fkey[1]}`] !== void 0) return Key[`F${fkey[1]}`];
    const cap = part.charAt(0).toUpperCase() + part.slice(1);
    return Key[cap] !== void 0 ? Key[cap] : null;
  }).filter((k) => k !== null);
}
function resolveButton(nutMod, btn) {
  const { Button } = nutMod;
  if (btn === "right") return Button.RIGHT;
  if (btn === "middle") return Button.MIDDLE;
  return Button.LEFT;
}
var inputDriver = {
  async isAvailable() {
    return loadNut();
  },
  // Execute one step. ctx = { log, clickDelay, profile, stageId, testMode }
  async perform(step, ctx) {
    const type = step.type || "action";
    if (ctx.testMode) {
      ctx.log(`\u21B3 [test] ${describe(step)}`);
      return true;
    }
    const ok = await loadNut();
    if (!ok) {
      ctx.log(`\u21B3 ${describe(step)} (mock \u2014 input driver unavailable)`);
      await delay(ctx.clickDelay);
      return true;
    }
    try {
      switch (type) {
        case "move":
          await nut.mouse.setPosition(new nut.Point(num(step.x), num(step.y)));
          break;
        case "click":
          await nut.mouse.setPosition(new nut.Point(num(step.x), num(step.y)));
          await delay(Math.min(ctx.clickDelay, 60));
          await nut.mouse.click(resolveButton(nut, step.button));
          break;
        case "key": {
          const keys = resolveKeys(nut, step.key);
          if (keys.length) {
            await nut.keyboard.pressKey(...keys);
            await nut.keyboard.releaseKey(...keys);
          }
          break;
        }
        case "text":
          if (step.text) await nut.keyboard.type(step.text);
          break;
        case "scroll":
          if (num(step.amount) > 0) await nut.mouse.scrollUp(Math.abs(num(step.amount)));
          else await nut.mouse.scrollDown(Math.abs(num(step.amount)));
          break;
        case "wait":
          await delay(num(step.ms));
          break;
        case "action":
        default:
          ctx.log(`\u21B3 ${step.value || step.action || "Action"} (no input recorded)`);
          await delay(ctx.clickDelay);
          return true;
      }
      ctx.log(`\u21B3 ${describe(step)}`);
      await delay(ctx.clickDelay);
      return true;
    } catch (err) {
      ctx.log(`\u21B3 ${describe(step)} \u2014 failed: ${err.message}`);
      return false;
    }
  }
};
function describe(step) {
  switch (step.type) {
    case "click":
      return `Click ${step.button || "left"} @ (${step.x}, ${step.y})${step.value ? " \u2014 " + step.value : ""}`;
    case "move":
      return `Move to (${step.x}, ${step.y})`;
    case "key":
      return `Press [${step.key}]`;
    case "text":
      return `Type "${(step.text || "").slice(0, 24)}"`;
    case "scroll":
      return `Scroll ${num(step.amount)}`;
    case "wait":
      return `Wait ${num(step.ms)} ms`;
    default:
      return step.value || step.action || "Action";
  }
}
var num = (v) => Number(v) || 0;
var delay = (ms) => new Promise((r) => setTimeout(r, Math.max(0, num(ms))));

// src/main/engine.js
var STATUS = {
  IDLE: "idle",
  COUNTDOWN: "countdown",
  RUNNING: "running",
  PAUSED: "paused"
};
function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
function stepLabel(step) {
  switch (step.type) {
    case "click":
      return `Click @ (${step.x}, ${step.y})`;
    case "move":
      return `Move (${step.x}, ${step.y})`;
    case "key":
      return `Key [${step.key}]`;
    case "text":
      return `Type text`;
    case "scroll":
      return `Scroll`;
    case "wait":
      return `Wait ${step.ms}ms`;
    default:
      return step.value || step.action || "Action";
  }
}
var MacroEngine = class extends EventEmitter {
  constructor(driver = inputDriver) {
    super();
    this.driver = driver;
    this.state = this._idleState();
    this._abort = false;
    this._pauseGate = null;
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
      currentMacroName: "",
      profileId: null,
      profileName: "",
      sessionStartedAt: null,
      testMode: false,
      log: []
    };
  }
  getState() {
    return { ...this.state, log: this.state.log.slice(-200) };
  }
  _emit() {
    this.emit("state", this.getState());
  }
  _log(msg) {
    const entry = { t: (/* @__PURE__ */ new Date()).toLocaleTimeString(), msg };
    this.state.log.push(entry);
    if (this.state.log.length > 400) this.state.log.shift();
    this.emit("log", entry);
  }
  _sleep(ms) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (this._abort) return resolve();
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
    const profiles = get("profiles", []);
    const activeId = get("settings", {}).activeProfileId;
    return profiles.find((p) => p.id === activeId) || profiles[0] || null;
  }
  _macroFor(profile) {
    const macros = get("macros", {});
    return macros[profile?.id] || null;
  }
  // ---- public controls -----------------------------------------------------
  async start() {
    if (this.state.status === STATUS.PAUSED) return this.resume();
    if (this.state.status !== STATUS.IDLE) return;
    const settings = get("settings", {});
    const profile = this._activeProfile();
    if (!profile) {
      this._log("No active profile configured.");
      return;
    }
    this._abort = false;
    this._pauseGate = null;
    this.state = this._idleState();
    this.state.profileId = profile.id;
    this.state.profileName = profile.name;
    this.state.currentMacroName = profile.macroName || "Macro";
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
        await this._sleep(1e3);
        if (this._abort) return this._finish("stopped");
      }
    }
    this.state.status = STATUS.RUNNING;
    this.state.currentStageId = null;
    this._emit();
    this._log(`${this.state.testMode ? "[TEST MODE] " : ""}Session started \u2014 profile "${profile.name}"`);
    this._startTicker();
    this._startRuntimeReports(profile);
    try {
      await this._runLoop(profile);
      this._finish(this._abort ? "stopped" : "success");
    } catch (err) {
      this._log(`Error: ${err.message}`);
      const wh = profile.webhook || {};
      if (wh.enabled && wh.errorNotifications) {
        webhook.sendError(profile, { error: err.message, state: this.getState() }).catch(() => {
        });
      }
      this._finish("failure");
    }
  }
  pause() {
    if (this.state.status !== STATUS.RUNNING) return;
    let release;
    this._pauseGate = new Promise((r) => release = r);
    this._pauseGate._release = release;
    this.state.status = STATUS.PAUSED;
    this._log("Macro paused.");
    this._emit();
  }
  resume() {
    if (this.state.status !== STATUS.PAUSED) return;
    const gate = this._pauseGate;
    this._pauseGate = null;
    gate?._release?.();
    this.state.status = STATUS.RUNNING;
    this._log("Macro resumed.");
    this._emit();
  }
  stop() {
    if (this.state.status === STATUS.IDLE) return;
    this._abort = true;
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
    }, 1e3);
  }
  _startRuntimeReports(profile) {
    clearInterval(this._runtimeReportTimer);
    const wh = profile.webhook || {};
    if (!wh.enabled || !wh.runtimeReports) return;
    const intervalMs = (Number(wh.runtimeReportMinutes) || 15) * 60 * 1e3;
    this._runtimeReportTimer = setInterval(() => {
      if (this.state.status === STATUS.RUNNING) {
        webhook.sendRuntimeReport(profile, this.getState()).catch(() => {
        });
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
    const loopSettings = profile.loopSettings || { mode: "infinite" };
    const delays = profile.delays || { actionDelay: 300, clickDelay: 140, loadBuffer: 3e3 };
    if (stages.length === 0) {
      this._log("Macro has no enabled stages \u2014 nothing to run.");
      return;
    }
    const timeLimitMs = loopSettings.mode === "time" ? (Number(loopSettings.minutes) || 60) * 6e4 : null;
    while (!this._abort) {
      if (loopSettings.mode === "count" && this.state.loopsCompleted >= Number(loopSettings.loops || 1)) break;
      if (timeLimitMs && this.state.elapsedMs >= timeLimitMs) break;
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
              log: (m) => this._log(m)
            });
            if (step.type !== "wait") {
              const after = step.delayAfter != null ? Number(step.delayAfter) : this.state.testMode ? Math.min(delays.actionDelay, 60) : delays.actionDelay;
              await this._sleep(after);
            }
          }
        }
        if (!this._abort) await this._sleep(this.state.testMode ? 120 : delays.loadBuffer);
      }
      if (this._abort) break;
      this.state.loopsCompleted += 1;
      this._log(`Loop ${this.state.loopsCompleted} completed.`);
      this._emit();
      const wh = profile.webhook || {};
      if (wh.enabled && wh.completionReports) {
        webhook.sendCompletion(profile, this.getState()).catch(() => {
        });
      }
    }
  }
  _finish(status) {
    clearInterval(this._tickTimer);
    clearInterval(this._runtimeReportTimer);
    this._tickTimer = null;
    this._runtimeReportTimer = null;
    const finalStatus = status === "success" ? "success" : status === "failure" ? "failure" : "stopped";
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
      testMode: this.state.testMode
    };
    if (!this.state.testMode) {
      const history = [record, ...get("history", [])].slice(0, 2e3);
      set("history", history);
      this.emit("history", record);
    }
    this._log(`Session ended (${finalStatus}).`);
    const profile = this._activeProfile();
    const wh = profile?.webhook || {};
    if (wh.enabled && wh.sessionSummary) {
      webhook.sendSessionSummary(profile, record).catch(() => {
      });
    }
    this.state.status = STATUS.IDLE;
    this.state.currentStageId = null;
    this.state.currentStep = null;
    this.state.countdown = 0;
    this._emit();
  }
};
var engine = new MacroEngine();

// src/main/recorder.js
import { EventEmitter as EventEmitter2 } from "node:events";
import { createRequire as createRequire2 } from "node:module";
var require3 = createRequire2(import.meta.url);
var uIOhook = null;
var UiohookKey = null;
var hookLoaded = false;
var hookAvailable = false;
async function loadHook() {
  if (hookLoaded) return hookAvailable;
  hookLoaded = true;
  try {
    const mod = require3("uiohook-napi");
    uIOhook = mod.uIOhook;
    UiohookKey = mod.UiohookKey;
    hookAvailable = true;
  } catch {
    hookAvailable = false;
  }
  return hookAvailable;
}
function keycodeToName(keycode) {
  if (!UiohookKey) return String(keycode);
  for (const [name, code] of Object.entries(UiohookKey)) {
    if (code === keycode) return name;
  }
  return String(keycode);
}
function normalizeKeyName(name) {
  const map = {
    Ctrl: "ctrl",
    CtrlRight: "ctrl",
    Alt: "alt",
    AltRight: "alt",
    Shift: "shift",
    ShiftRight: "shift",
    Meta: "meta",
    MetaRight: "meta",
    Space: "space",
    Enter: "enter",
    Escape: "esc",
    Tab: "tab",
    Backspace: "backspace"
  };
  if (map[name]) return map[name];
  if (/^[A-Z]$/.test(name)) return name.toLowerCase();
  const num2 = name.match(/^(\d)$/);
  if (num2) return num2[1];
  const f = name.match(/^F(\d{1,2})$/);
  if (f) return `f${f[1]}`;
  return name.toLowerCase();
}
var Recorder = class extends EventEmitter2 {
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
    if (gap > 120) {
      const step = { id: this._id(), type: "wait", enabled: true, repeat: 1, ms: Math.min(gap, 6e4), value: "", delayAfter: 0 };
      this.steps.push(step);
      this.emit("step", step);
    }
  }
  _add(step) {
    this.steps.push(step);
    this.emit("step", step);
  }
  async start(options = {}) {
    if (this.recording) return { ok: false, reason: "already-recording" };
    const ok = await loadHook();
    if (!ok) return { ok: false, reason: "unavailable" };
    this.recording = true;
    this.captureMoves = !!options.captureMoves;
    this.steps = [];
    this.lastEventAt = 0;
    this._seq = 0;
    const onMouseDown = (e) => {
      if (!this.recording) return;
      this._pushWaitGap();
      const button = e.button === 2 ? "right" : e.button === 3 ? "middle" : "left";
      this._add({ id: this._id(), type: "click", enabled: true, repeat: 1, x: e.x, y: e.y, button, value: "", delayAfter: 0 });
    };
    const onWheel = (e) => {
      if (!this.recording) return;
      this._pushWaitGap();
      const amount = e.rotation ? -e.rotation : e.direction === 3 ? -3 : 3;
      this._add({ id: this._id(), type: "scroll", enabled: true, repeat: 1, amount, value: "", delayAfter: 0 });
    };
    const onKeyDown = (e) => {
      if (!this.recording) return;
      const name = normalizeKeyName(keycodeToName(e.keycode));
      this._pushWaitGap();
      this._add({ id: this._id(), type: "key", enabled: true, repeat: 1, key: name, value: "", delayAfter: 0 });
    };
    this._handlers = { onMouseDown, onWheel, onKeyDown };
    uIOhook.on("mousedown", onMouseDown);
    uIOhook.on("wheel", onWheel);
    uIOhook.on("keydown", onKeyDown);
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
        uIOhook.off("mousedown", this._handlers.onMouseDown);
        uIOhook.off("wheel", this._handlers.onWheel);
        uIOhook.off("keydown", this._handlers.onKeyDown);
      }
      uIOhook.stop();
    } catch {
    }
    this._handlers = null;
    const steps = this.steps;
    this.emit("stopped", steps);
    return { ok: true, steps };
  }
};
var recorder = new Recorder();

// src/main/defaults.js
var DELAY_PRESETS = {
  fast: { id: "fast", label: "Fast PC", actionDelay: 120, clickDelay: 60, loadBuffer: 1500 },
  average: { id: "average", label: "Average PC", actionDelay: 300, clickDelay: 140, loadBuffer: 3e3 },
  slow: { id: "slow", label: "Slow PC", actionDelay: 600, clickDelay: 280, loadBuffer: 6e3 }
};
var MACRO_STAGES = [
  { id: "lobby", name: "Lobby Actions", actions: ["Navigate lobby", "Open elevators", "Select map", "Select difficulty"] },
  { id: "loadout", name: "Loadout Actions", actions: ["Equip towers", "Equip consumables", "Select preferred loadout"] },
  { id: "match", name: "Match Actions", actions: ["Place towers", "Upgrade towers", "Sell towers", "Activate abilities", "Wait for wave timers"] },
  { id: "end", name: "End-of-Match Actions", actions: ["Return to lobby", "Requeue", "Restart sequence"] }
];
var PROFILE_TYPES = [
  { id: "solo", name: "Solo Grinding", icon: "\u{1F9CD}", accent: "#7c5cff" },
  { id: "event", name: "Event Grinding", icon: "\u{1F389}", accent: "#ff5c8a" },
  { id: "coin", name: "Coin Farming", icon: "\u{1FA99}", accent: "#ffb648" },
  { id: "xp", name: "XP Farming", icon: "\u2B50", accent: "#5cc8ff" }
];
var DEFAULT_SETTINGS = {
  launchOnStartup: false,
  startMinimizedToTray: false,
  closeToTray: true,
  sessionCountdown: 3,
  autoPauseResume: true,
  testMode: false,
  theme: "dark",
  activeProfileId: "solo"
};
function defaultMacroStages() {
  return MACRO_STAGES.map((s) => ({
    stageId: s.id,
    enabled: true,
    steps: s.actions.map((a, i) => ({ id: `${s.id}-${i}`, action: a, enabled: true, repeat: 1 }))
  }));
}
function defaultProfiles() {
  return PROFILE_TYPES.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    accent: p.accent,
    macroName: `${p.name} Macro`,
    loopSettings: { mode: "count", loops: 25 },
    delayPreset: "average",
    delays: { ...DELAY_PRESETS.average },
    webhook: {
      enabled: false,
      url: "",
      username: "Shadow Macro",
      avatarUrl: "",
      sessionSummary: true,
      runtimeReports: true,
      runtimeReportMinutes: 15,
      completionReports: false,
      errorNotifications: true
    }
  }));
}
function defaultMacrosForProfiles(profiles) {
  const macros = {};
  for (const p of profiles) {
    macros[p.id] = { id: `macro-${p.id}`, name: p.macroName, stages: defaultMacroStages() };
  }
  return macros;
}

// src/main/main.js
var __dirname = path3.dirname(fileURLToPath(import.meta.url));
var isDev = !app3.isPackaged;
var mainWindow = null;
var tray = null;
var isQuitting = false;
function seedStore() {
  const settings = get("settings", null);
  if (!settings) {
    const profiles = defaultProfiles();
    set("settings", { ...DEFAULT_SETTINGS, activeProfileId: profiles[0].id });
    set("profiles", profiles);
    set("macros", defaultMacrosForProfiles(profiles));
    set("history", []);
  } else {
    get("profiles", defaultProfiles());
    get("macros", {});
    get("history", []);
  }
}
function setting(key, fallback) {
  return get("settings", {})[key] ?? fallback;
}
function resolveRendererURL() {
  if (isDev) return "http://localhost:5173";
  return `file://${path3.join(__dirname, "../../dist/index.html")}`;
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0b0d12",
    show: false,
    title: "Shadow Macro",
    // Hide the native menu bar — Shadow Macro is driven by its in-window UI and
    // the system tray, so the default "File / Edit / View / …" menu is removed.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path3.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadURL(resolveRendererURL());
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();
  const startMinimized = setting("startMinimizedToTray", false) || process.argv.includes("--minimized");
  mainWindow.once("ready-to-show", () => {
    if (!startMinimized) mainWindow.show();
  });
  mainWindow.on("close", (e) => {
    if (!isQuitting && setting("closeToTray", true)) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("blur", () => {
    if (setting("autoPauseResume", true) && engine.getState().status === "running") {
      engine.pause();
    }
  });
  mainWindow.on("focus", () => {
    if (setting("autoPauseResume", true) && engine.getState().status === "paused") {
      engine.resume();
    }
  });
}
function trayIcon() {
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAVUlEQVR4nGNgGAWjYBSMglEwCgYJYGRgYPjPwMDwn4GBgYGBkYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYEBAH9bA0r6dQ0kAAAAAElFTkSuQmCC";
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
  tray.setToolTip("Shadow Macro");
  rebuildTrayMenu();
  tray.on("double-click", showDashboard);
}
function rebuildTrayMenu() {
  if (!tray) return;
  const st = engine.getState().status;
  const menu = Menu.buildFromTemplate([
    { label: "Shadow Macro", enabled: false },
    { type: "separator" },
    { label: "Start Macro", enabled: st === "idle" || st === "paused", click: () => engine.start() },
    { label: "Pause Macro", enabled: st === "running", click: () => engine.pause() },
    { label: "Stop Macro", enabled: st !== "idle", click: () => engine.stop() },
    { type: "separator" },
    { label: "Open Dashboard", click: showDashboard },
    { type: "separator" },
    {
      label: "Exit",
      click: () => {
        isQuitting = true;
        app3.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
}
function applyLaunchOnStartup(enabled) {
  app3.setLoginItemSettings({
    openAtLogin: !!enabled,
    args: setting("startMinimizedToTray", false) ? ["--minimized"] : []
  });
}
function wireEngineEvents() {
  engine.on("state", (state) => {
    sendToRenderer("engine:state", state);
    rebuildTrayMenu();
    if (tray) tray.setToolTip(`Shadow Macro \u2014 ${state.status}`);
  });
  engine.on("log", (entry) => sendToRenderer("engine:log", entry));
  engine.on("history", (record) => sendToRenderer("engine:history", record));
  recorder.on("step", (step) => sendToRenderer("recorder:step", step));
  recorder.on("stopped", (steps) => sendToRenderer("recorder:stopped", steps));
}
function registerIpc() {
  ipcMain.handle("store:get", (_e, domain, fallback) => get(domain, fallback));
  ipcMain.handle("store:set", (_e, domain, value) => {
    set(domain, value);
    if (domain === "settings") applyLaunchOnStartup(value.launchOnStartup);
    return true;
  });
  ipcMain.handle("engine:start", () => engine.start());
  ipcMain.handle("engine:pause", () => engine.pause());
  ipcMain.handle("engine:resume", () => engine.resume());
  ipcMain.handle("engine:stop", () => engine.stop());
  ipcMain.handle("engine:getState", () => engine.getState());
  ipcMain.handle("webhook:test", async (_e, profile) => webhook.test(profile));
  ipcMain.handle("recorder:available", async () => recorder.isAvailable());
  ipcMain.handle("recorder:start", async (_e, options) => recorder.start(options));
  ipcMain.handle("recorder:stop", async () => recorder.stop());
  ipcMain.handle("input:available", async () => inputDriver.isAvailable());
  ipcMain.handle("updater:check", async () => checkForUpdates());
  ipcMain.handle("updater:backup", async () => backupBeforeUpdate());
  ipcMain.handle("updater:openDownload", async (_e, url) => {
    if (url && /^https?:\/\//.test(url)) await shell.openExternal(url);
    return true;
  });
  ipcMain.handle("window:minimizeToTray", () => mainWindow?.hide());
  ipcMain.handle("app:exit", () => {
    isQuitting = true;
    app3.quit();
  });
  ipcMain.handle("app:getVersion", () => app3.getVersion());
}
var gotLock = app3.requestSingleInstanceLock();
if (!gotLock) {
  app3.quit();
} else {
  app3.on("second-instance", showDashboard);
  app3.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    seedStore();
    registerIpc();
    wireEngineEvents();
    createWindow();
    buildTray();
    applyLaunchOnStartup(setting("launchOnStartup", false));
    app3.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app3.on("before-quit", () => {
    isQuitting = true;
    engine.stop();
    flushAll();
  });
  app3.on("window-all-closed", () => {
    if (process.platform !== "darwin" && isQuitting) app3.quit();
  });
}
