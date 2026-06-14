// Updater + automatic backup (main process).
//
// "Notify + open download" strategy backed by GitHub Releases:
//   1. Ask GitHub for the repo's latest release (no auth/token required).
//   2. Compare its tag (e.g. "v1.1.0") to the installed version.
//   3. If newer, the renderer shows a notice + "Download Update" button that
//      opens the release's .exe asset in the browser; the user installs it.
//
// No manifest file to maintain — just upload your installer to a GitHub Release.
//
// The BACKUP is real: it copies the live data files (settings, profiles, macros,
// history) into a timestamped folder under userData/backups.

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import * as store from './store.js';

const CURRENT_VERSION = app?.getVersion?.() || '1.0.0';

// -------------------------------------------------------------------------
// CONFIGURE THIS: your GitHub repository in "owner/repo" form, e.g.
//   const GITHUB_REPO = 'your-username/shadow-macro';
// You can also override at runtime with the SHADOW_GITHUB_REPO env var.
// Leave as null until you create the repo — the app then reports "up to date".
const GITHUB_REPO = process.env.SHADOW_GITHUB_REPO || null;

// Optional: a plain JSON feed instead of GitHub. If set, it takes precedence.
// Shape: { "version": "1.1.0", "notes": "…", "url": "https://…/Setup.exe" }
const UPDATE_FEED_URL = process.env.SHADOW_UPDATE_FEED || null;

function cleanVersion(v) {
  return String(v || '').trim().replace(/^v/i, '');
}

function semverGt(a, b) {
  const pa = cleanVersion(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = cleanVersion(b).split('.').map((n) => parseInt(n, 10) || 0);
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
    notes: 'You are running the latest version of Shadow Macro.',
    downloadUrl: null,
    releaseUrl: null,
    checkedAt: new Date().toISOString(),
    ...extra,
  };
}

async function checkGenericFeed() {
  const res = await fetch(UPDATE_FEED_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const feed = await res.json();
  const available = semverGt(feed.version, CURRENT_VERSION);
  return {
    currentVersion: CURRENT_VERSION,
    latestVersion: cleanVersion(feed.version),
    available,
    notes: feed.notes || (available ? `Version ${feed.version} is available.` : 'You are up to date.'),
    downloadUrl: feed.url || null,
    releaseUrl: feed.url || null,
    checkedAt: new Date().toISOString(),
  };
}

async function checkGitHub() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Shadow-Macro-Updater',
    },
  });
  if (res.status === 404) {
    // No releases yet (or repo private/wrong) — treat as up to date.
    return upToDate({ notes: 'No published releases found yet.' });
  }
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);

  const rel = await res.json();
  const latest = cleanVersion(rel.tag_name || rel.name);
  const available = semverGt(latest, CURRENT_VERSION);

  // Prefer the .exe asset; fall back to the release page.
  const exeAsset = (rel.assets || []).find((a) => /\.exe$/i.test(a.name));
  const downloadUrl = exeAsset ? exeAsset.browser_download_url : rel.html_url;

  return {
    currentVersion: CURRENT_VERSION,
    latestVersion: latest || CURRENT_VERSION,
    available,
    notes: available
      ? (rel.body?.slice(0, 500) || `Shadow Macro v${latest} is available.`)
      : 'You are running the latest version of Shadow Macro.',
    downloadUrl,
    releaseUrl: rel.html_url || null,
    publishedAt: rel.published_at || null,
    checkedAt: new Date().toISOString(),
  };
}

export async function checkForUpdates() {
  try {
    if (UPDATE_FEED_URL) return await checkGenericFeed();
    if (GITHUB_REPO) return await checkGitHub();
    // Nothing configured yet.
    await new Promise((r) => setTimeout(r, 300));
    return upToDate({ notes: 'Auto-update source not configured yet.' });
  } catch (err) {
    return {
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      available: false,
      notes: `Update check failed: ${err.message}`,
      downloadUrl: null,
      releaseUrl: null,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function backupBeforeUpdate() {
  store.flushAll();

  const userData = store.userDataDir();
  const backupDir = path.join(userData, 'backups', `backup-${Date.now()}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const copied = [];
  for (const name of Object.values(store.STORE_FILES)) {
    const src = path.join(userData, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backupDir, name));
      copied.push(name);
    }
  }

  // keep the 20 most recent backups
  try {
    const root = path.join(userData, 'backups');
    const dirs = fs.readdirSync(root).filter((d) => d.startsWith('backup-')).sort();
    while (dirs.length > 20) {
      const old = dirs.shift();
      fs.rmSync(path.join(root, old), { recursive: true, force: true });
    }
  } catch {}

  return { backupDir, copied, createdAt: new Date().toISOString() };
}
