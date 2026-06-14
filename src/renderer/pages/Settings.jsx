import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { bridge } from '../lib/bridge.js';
import { fmtDateTime } from '../lib/format.js';

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <label className="row between" style={{ cursor: 'pointer', padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {desc && <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{desc}</div>}
      </div>
      <span className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="track" />
      </span>
    </label>
  );
}

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const checkUpdates = useStore((s) => s.checkUpdates);
  const updateInfo = useStore((s) => s.updateInfo);

  const [checking, setChecking] = useState(false);
  const [backup, setBackup] = useState(null);
  const [version, setVersion] = useState('1.0.0');

  useEffect(() => {
    bridge.app.getVersion().then(setVersion);
  }, []);

  async function onCheck() {
    setChecking(true);
    await checkUpdates();
    setChecking(false);
  }
  async function onBackup() {
    const res = await bridge.updater.backup();
    setBackup(res);
  }
  async function onDownload() {
    if (updateInfo?.downloadUrl) {
      // Auto-backup before sending the user off to install the update.
      await bridge.updater.backup().then(setBackup);
      bridge.updater.openDownload(updateInfo.downloadUrl);
    }
  }

  return (
    <div className="grid grid-2" style={{ alignItems: 'start', gap: 16 }}>
      <div className="grid" style={{ gap: 16 }}>
        <div className="panel">
          <div className="panel-title">Startup &amp; System</div>
          <ToggleRow label="Launch on Windows startup" desc="Start Shadow Macro automatically when you log in"
            checked={settings.launchOnStartup} onChange={(v) => setSetting('launchOnStartup', v)} />
          <ToggleRow label="Start minimized to system tray" desc="Hide the window on launch and live in the tray"
            checked={settings.startMinimizedToTray} onChange={(v) => setSetting('startMinimizedToTray', v)} />
          <ToggleRow label="Close to tray" desc="Closing the window keeps the macro running in the tray"
            checked={settings.closeToTray} onChange={(v) => setSetting('closeToTray', v)} />
        </div>

        <div className="panel">
          <div className="panel-title">Session Behavior</div>
          <label className="field">
            <span className="lbl">Session countdown (seconds)</span>
            <input type="number" min="0" max="30" value={settings.sessionCountdown} onChange={(e) => setSetting('sessionCountdown', Number(e.target.value))} />
          </label>
          <ToggleRow label="Automatic pause / resume" desc="Pause when the game loses focus, resume when it returns"
            checked={settings.autoPauseResume} onChange={(v) => setSetting('autoPauseResume', v)} />
          <ToggleRow label="Macro test mode" desc="Run the sequence without recording it as a real session"
            checked={settings.testMode} onChange={(v) => setSetting('testMode', v)} />
        </div>
      </div>

      <div className="grid" style={{ gap: 16 }}>
        <div className="panel">
          <div className="panel-title">Updates</div>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Current version</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>v{version}</div>
            </div>
            <button className="btn btn-primary" onClick={onCheck} disabled={checking}>
              {checking ? 'Checking…' : 'Check for Updates'}
            </button>
          </div>

          <ToggleRow
            label="Automatic updates"
            desc="Check Shadow Macro's GitHub for new releases"
            checked={settings.autoUpdateEnabled !== false}
            onChange={(v) => setSetting('autoUpdateEnabled', v)}
          />
          {settings.autoUpdateEnabled !== false && (
            <ToggleRow
              label="Check on startup"
              desc="Look for updates a few seconds after launch"
              checked={settings.autoUpdateCheckOnStartup !== false}
              onChange={(v) => setSetting('autoUpdateCheckOnStartup', v)}
            />
          )}

          {updateInfo && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '10px 12px', background: 'var(--bg-0)', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
              {updateInfo.available ? (
                <div className="grid" style={{ gap: 10 }}>
                  <span className="badge badge-good">Update available: v{updateInfo.latestVersion}</span>
                  {updateInfo.notes && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'auto' }}>
                      {updateInfo.notes}
                    </div>
                  )}
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-good btn-sm" onClick={onDownload}>⬇ Download Update</button>
                    {updateInfo.releaseUrl && (
                      <button className="btn btn-sm" onClick={() => bridge.updater.openDownload(updateInfo.releaseUrl)}>
                        View Release
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    Your settings &amp; macros are backed up automatically before you download.
                  </div>
                </div>
              ) : (
                <span>✓ {updateInfo.notes}</span>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>Checked {fmtDateTime(updateInfo.checkedAt)}</div>
            </div>
          )}
          <div className="divider" />
          <div className="row between">
            <div>
              <div style={{ fontWeight: 600 }}>Backup before updating</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Settings, macros, profiles &amp; history</div>
            </div>
            <button className="btn" onClick={onBackup}>Backup Now</button>
          </div>
          {backup && (
            <div style={{ fontSize: 12, color: 'var(--good)', marginTop: 10 }}>
              ✓ Backed up {backup.copied.length} file(s) · {fmtDateTime(backup.createdAt)}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">System Tray</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            When running as the desktop app, Shadow Macro lives in the system tray with quick controls:
          </div>
          <div className="grid" style={{ gap: 6, marginTop: 12 }}>
            {['Start Macro', 'Stop Macro', 'Pause Macro', 'Open Dashboard', 'Exit'].map((t) => (
              <div key={t} className="step-row"><span style={{ color: 'var(--accent-2)' }}>▸</span> {t}</div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-sm" onClick={() => bridge.window.minimizeToTray()}>Minimize to Tray</button>
            <button className="btn btn-sm btn-bad" onClick={() => bridge.app.exit()}>Exit App</button>
          </div>
        </div>
      </div>
    </div>
  );
}
