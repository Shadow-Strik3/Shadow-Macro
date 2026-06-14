# 🛡️ Shadow Macro — TDS Automation Suite

A dedicated **Tower Defense Simulator** automation suite (not a generic macro
recorder). Built with **Electron + React + Vite** with a professional dark,
dashboard-focused UI optimized for long unattended farming sessions.

> **Build status:** Full core implemented and packaged to a Windows installer.
> The engine, persistent store, Discord webhook delivery, and updater/backup all
> run in the Electron **main process**, so sessions continue even when the
> window is hidden in the tray. The only intentional stub is the OS-level
> **input driver** (the engine ships with a mock driver that logs each action
> instead of sending real keystrokes/clicks) — swap it to enable real
> automation. See "Wiring real automation" below.
>
> **Installer:** `release/Shadow Macro Setup 1.0.0.exe` (NSIS, x64).

---

## ✨ Features in this build

### Startup & System
- Launch on Windows startup (Electron `loginItem`).
- Start minimized to system tray.
- Close-to-tray behavior.
- Built-in updater (mock check) with **automatic backup** of settings, macros,
  profiles & history before updates.
- System tray menu: **Start / Stop / Pause / Open Dashboard / Exit**.

### TDS Dashboard
- Current profile, current macro, session runtime, runs completed,
  estimated runs/hour.
- Live macro pipeline (4 stages) and a live session log.

### Profiles
- Built-in: **Solo Grinding, Event Grinding, Coin Farming, XP Farming** + custom.
- Each profile stores: macro, loop settings, delays, webhook settings.

### Macro Structure (4 stages)
1. **Lobby Actions** — navigate lobby, open elevators, select map, difficulty
2. **Loadout Actions** — equip towers/consumables, preferred loadout
3. **Match Actions** — place/upgrade/sell towers, abilities, wave timers
4. **End-of-Match Actions** — return to lobby, requeue, restart

### Session Tools
- Session countdown, auto pause/resume toggle, **test mode**.
- Delay presets: **Fast PC / Average PC / Slow PC** (editable).

### Run History & Statistics
- Records: date/time, macro, profile, duration, loops, coins (manual entry),
  success/failure status.
- Lifetime stats: total runtime, runs, loops, longest session, most-used macro,
  success rate, averages.
- **Export run history to CSV.**

### Discord Webhooks
- Per-profile webhook, custom username & avatar.
- Toggles: session summaries, runtime reports, completion reports, error alerts.
- Live **rich embed preview**.

---

## 🚀 Running it

```bash
npm install

# Web dev server (full UI in the browser)
npm run dev            # http://localhost:5173

# Run as the Electron desktop app (tray, startup, updater)
npm run dev:electron

# Build the desktop installer (Windows NSIS)
npm run build
```

### Workspace preview
`npm run build:preview` generates **`../shadow-macro-preview.html`** — a single,
self-contained file (inlined JS + CSS, localStorage persistence) that renders
fully inside a sandboxed iframe with no network access.

---

## 🗂️ Project structure

```
src/
  main/        Electron main process (window, tray, startup, updater, settings)
  preload/     Secure contextBridge API
  renderer/
    components/ Sidebar, Topbar, EngineControls
    pages/      TdsDashboard, Profiles, MacroBuilder, RunHistory,
                Statistics, Webhooks, Settings
    store/      Zustand store (state, simulated engine, history, stats)
    data/       Delay presets, profile templates, macro stage taxonomy
    lib/        Platform bridge (Electron ↔ web fallback), formatters
scripts/
  build-preview.mjs   Inlines build output into a single preview.html
```

## 🧠 Core architecture
The core lives entirely in the **main process** (`src/main/`):

| Module | Responsibility |
|--------|----------------|
| `engine.js` | Real run loop: steps enabled stages → enabled steps × repeat, honoring delays; pause/resume/stop; loop-count / time / infinite modes; records run history; fires webhook reports. Emits `state`/`log`/`history` events. |
| `store.js` | Atomic, debounced JSON persistence (settings, profiles, macros, history) in `userData`. |
| `webhook.js` | Real Discord rich-embed delivery via `fetch` (session summary, runtime, completion, error, test). |
| `updater.js` | "Notify + open download" updater via **GitHub Releases** (or a custom JSON feed) + **real backup** of all data files before updating. |

## 🔄 Auto-updater (GitHub Releases)
Shadow Macro uses a simple, free **"notify + open download"** updater — it does
**not** require code-signing or any publishing tooling.

**How it works:** the app calls GitHub's public API for your repo's *latest
release*, compares its tag (e.g. `v1.1.0`) to the installed version, and if it's
newer shows a notice + **Download Update** button (which opens the release's
`.exe`). Your settings/macros are auto-backed-up first.

**Setup (one line):** open `src/main/updater.js` and set your repo:
```js
const GITHUB_REPO = 'your-username/shadow-macro';   // owner/repo
```
(or set the `SHADOW_GITHUB_REPO` env var). Until this is set, the app simply
reports "up to date".

**Publishing a new version:**
1. Bump `version` in `package.json` (e.g. `1.1.0`) and run `npm run dist:win`.
2. On GitHub, create a **Release** with tag `v1.1.0`.
3. Upload `release/Shadow Macro Setup 1.1.0.exe` as a release asset.

That's it — existing installs will detect it on the next "Check for Updates".
No token, no manifest file, no server needed. (Repo must be **public** for the
unauthenticated API call; for private repos you'd add a token or use a custom
`SHADOW_UPDATE_FEED` JSON URL instead.)

> **Other hosts:** to use your own server instead of GitHub, set
> `SHADOW_UPDATE_FEED` to a JSON URL shaped like
> `{ "version": "1.1.0", "notes": "…", "url": "https://…/Setup.exe" }`.
> For *fully silent* background auto-install (vs. notify+download), you'd switch
> to `electron-updater` — that path benefits from code-signing to avoid Windows
> SmartScreen prompts.
| `inputDriver.js` | Executes a step as real OS input (nut-js); graceful mock fallback. |
| `recorder.js` | Global input capture (uiohook-napi) → macro steps; graceful fallback. |
| `main.js` | Window, tray (Start/Pause/Stop/Open/Exit), startup, auto pause/resume on blur/focus, IPC, engine + recorder event forwarding. |

The renderer (`src/renderer/`) is a thin client: it drives the core over IPC
(`lib/bridge.js`) and renders `engine:state` events. In the **web preview**
(no Electron), `lib/webEngine.js` mirrors the same engine + event surface using
localStorage, so the whole UI stays interactive.

## 🎬 Recording & editing macros
Each profile's macro is a list of **concrete, executable steps** grouped by the
four TDS stages. Steps are no longer just labels.

**Step types:** `click` (x, y, button), `move`, `key` (e.g. `e`, `ctrl+a`, `f5`),
`text`, `wait` (ms), `scroll`, and `action` (a label-only placeholder, used by
the legacy seed steps and auto-migrated from older saves).

**Live recorder** — in the Macro Builder, press **⏺ Record Inputs**, choose the
target stage, then your real mouse clicks / key presses are captured (with
human-like `wait` gaps inserted automatically) and appended as steps. Powered by
`uiohook-napi` (desktop only).

**Manual editing** — every step can be toggled, edited (type + fields + repeat +
delay-after + note), reordered (↑/↓), inserted, or deleted. Edits autosave to
the profile.

## ⚡ Real input execution
The engine executes each step through `src/main/inputDriver.js`, which uses
`@nut-tree-fork/nut-js` to send **real mouse/keyboard input** on the desktop
app. The native modules are loaded lazily and guarded: if unavailable (or in the
web preview / Test mode), steps are logged instead of performed, so the app
never crashes. The capability badges in the Macro Builder show whether the real
recorder and input driver are active.

> **Native modules:** `@nut-tree-fork/nut-js` (input synthesis) and
> `uiohook-napi` (input capture) ship prebuilt binaries incl. `win32-x64`.
> electron-builder unpacks them via `asarUnpack` so they load at runtime.

## 🗂️ Note on `buildResources/`
App icons live in **`buildResources/`** (not `build/`, which is a reserved
build-output directory). `buildResources/icon.ico` is the multi-resolution
Windows icon used by the installer and the app window.

## 🛠️ Building the Windows installer
```bash
npm run dist:win     # → release/Shadow Macro Setup <version>.exe (NSIS, x64)
```
On non-Windows hosts this requires **Wine** (electron-builder uses it to stamp
the NSIS installer). On Windows, no extra tooling is needed.
