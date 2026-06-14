import React, { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { DELAY_PRESETS } from '../data/presets.js';

export default function Profiles() {
  const profiles = useStore((s) => s.profiles);
  const activeId = useStore((s) => s.activeProfileId);
  const setActive = useStore((s) => s.setActiveProfile);
  const updateProfile = useStore((s) => s.updateProfile);
  const addCustom = useStore((s) => s.addCustomProfile);
  const removeProfile = useStore((s) => s.removeProfile);

  const [selectedId, setSelectedId] = useState(activeId);
  const profile = profiles.find((p) => p.id === selectedId) || profiles[0];

  function patch(p) {
    updateProfile(profile.id, p);
  }
  function patchDelays(d) {
    patch({ delays: { ...profile.delays, ...d } });
  }
  function applyPreset(id) {
    patch({ delayPreset: id, delays: { ...DELAY_PRESETS[id] } });
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '280px 1fr', alignItems: 'start' }}>
      {/* Profile list */}
      <div className="panel">
        <div className="panel-title">Profiles</div>
        <div className="grid" style={{ gap: 8 }}>
          {profiles.map((p) => (
            <button
              key={p.id}
              className={`profile-pill ${p.id === selectedId ? 'active' : ''}`}
              onClick={() => setSelectedId(p.id)}
            >
              <span className="em">{p.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.macroName}</div>
              </div>
              {p.id === activeId && <span className="badge badge-good">Active</span>}
            </button>
          ))}
        </div>
        <div className="divider" />
        <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => setSelectedId(addCustom('New Custom Profile'))}>
          ＋ Add Custom Profile
        </button>
      </div>

      {/* Editor */}
      {profile && (
        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <div className="row between">
              <div className="panel-title" style={{ margin: 0 }}>Profile Settings</div>
              <div className="row">
                {profile.id !== activeId && (
                  <button className="btn btn-sm btn-primary" onClick={() => setActive(profile.id)}>Set as Active</button>
                )}
                {profile.id.startsWith('custom-') && (
                  <button className="btn btn-sm btn-bad" onClick={() => { removeProfile(profile.id); }}>Delete</button>
                )}
              </div>
            </div>
            <div className="divider" />
            <div className="grid grid-2">
              <label className="field">
                <span className="lbl">Profile Name</span>
                <input type="text" value={profile.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="field">
                <span className="lbl">Macro</span>
                <input type="text" value={profile.macroName} onChange={(e) => patch({ macroName: e.target.value })} />
              </label>
            </div>
          </div>

          <div className="grid grid-2" style={{ alignItems: 'start' }}>
            <div className="panel">
              <div className="panel-title">Loop Settings</div>
              <label className="field">
                <span className="lbl">Loop Mode</span>
                <select value={profile.loopSettings.mode} onChange={(e) => patch({ loopSettings: { ...profile.loopSettings, mode: e.target.value } })}>
                  <option value="count">Fixed loop count</option>
                  <option value="infinite">Infinite (until stopped)</option>
                  <option value="time">Time limited</option>
                </select>
              </label>
              {profile.loopSettings.mode === 'count' && (
                <label className="field">
                  <span className="lbl">Number of Loops</span>
                  <input type="number" min="1" value={profile.loopSettings.loops}
                    onChange={(e) => patch({ loopSettings: { ...profile.loopSettings, loops: Number(e.target.value) } })} />
                </label>
              )}
              {profile.loopSettings.mode === 'time' && (
                <label className="field">
                  <span className="lbl">Duration (minutes)</span>
                  <input type="number" min="1" value={profile.loopSettings.minutes || 60}
                    onChange={(e) => patch({ loopSettings: { ...profile.loopSettings, minutes: Number(e.target.value) } })} />
                </label>
              )}
            </div>

            <div className="panel">
              <div className="panel-title">Delays</div>
              <label className="field">
                <span className="lbl">Delay Preset</span>
                <div className="row">
                  {Object.values(DELAY_PRESETS).map((d) => (
                    <button key={d.id} className={`btn btn-sm ${profile.delayPreset === d.id ? 'btn-primary' : ''}`} onClick={() => applyPreset(d.id)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </label>
              <div className="grid grid-3">
                <label className="field">
                  <span className="lbl">Action (ms)</span>
                  <input type="number" value={profile.delays.actionDelay} onChange={(e) => patchDelays({ actionDelay: Number(e.target.value) })} />
                </label>
                <label className="field">
                  <span className="lbl">Click (ms)</span>
                  <input type="number" value={profile.delays.clickDelay} onChange={(e) => patchDelays({ clickDelay: Number(e.target.value) })} />
                </label>
                <label className="field">
                  <span className="lbl">Load buffer (ms)</span>
                  <input type="number" value={profile.delays.loadBuffer} onChange={(e) => patchDelays({ loadBuffer: Number(e.target.value) })} />
                </label>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Webhook (per profile)</div>
            <label className="toggle" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={profile.webhook.enabled} onChange={(e) => patch({ webhook: { ...profile.webhook, enabled: e.target.checked } })} />
              <span className="track" />
              <span>Enable Discord webhook for this profile</span>
            </label>
            <label className="field">
              <span className="lbl">Webhook URL</span>
              <input type="url" placeholder="https://discord.com/api/webhooks/..." value={profile.webhook.url}
                onChange={(e) => patch({ webhook: { ...profile.webhook, url: e.target.value } })} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
