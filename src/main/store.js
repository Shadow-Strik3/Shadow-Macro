// Persistent data layer for Shadow Macro (main process).
// Each domain is a JSON file in Electron's userData directory. Writes are
// debounced and atomic (write temp + rename) to survive crashes mid-write.

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const FILES = {
  settings: 'settings.json',
  profiles: 'profiles.json',
  macros: 'macros.json',
  history: 'run-history.json',
};

const cache = {};
const writeTimers = {};

function userDataDir() {
  return app.getPath('userData');
}

function filePath(domain) {
  return path.join(userDataDir(), FILES[domain]);
}

function readRaw(domain, fallback) {
  try {
    const txt = fs.readFileSync(filePath(domain), 'utf-8');
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
    fs.writeFileSync(tmp, JSON.stringify(cache[domain], null, 2), 'utf-8');
    fs.renameSync(tmp, fp);
  } catch (err) {
    console.error(`[store] failed to write ${domain}:`, err);
  }
}

function scheduleWrite(domain) {
  clearTimeout(writeTimers[domain]);
  writeTimers[domain] = setTimeout(() => writeAtomic(domain), 200);
}

export function get(domain, fallback) {
  if (!(domain in cache)) cache[domain] = readRaw(domain, fallback);
  return cache[domain];
}

export function set(domain, value) {
  cache[domain] = value;
  scheduleWrite(domain);
  return value;
}

// Flush any pending writes immediately (used on quit / before backups).
export function flushAll() {
  for (const domain of Object.keys(FILES)) {
    clearTimeout(writeTimers[domain]);
    if (domain in cache) writeAtomic(domain);
  }
}

export const STORE_FILES = FILES;
export { userDataDir };
