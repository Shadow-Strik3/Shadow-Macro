import React, { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { bridge } from '../lib/bridge.js';

// Configures the active profile's Discord webhook plus a live embed preview
// resembling how Shadow Macro reports will look in Discord.

function EmbedPreview({ wh, profileName }) {
  return (
    <div style={{ background: '#2b2d31', borderRadius: 8, padding: 16, fontFamily: 'system-ui' }}>
      <div className="row" style={{ gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: wh.avatarUrl ? `center/cover url(${wh.avatarUrl})` : 'linear-gradient(135deg,#7c5cff,#4a2fb0)', display: 'grid', placeItems: 'center' }}>
          {!wh.avatarUrl && '🛡️'}
        </div>
        <div>
          <div style={{ fontWeight: 700, color: '#fff' }}>{wh.username || 'Shadow Macro'} <span style={{ background: '#5865f2', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 3, verticalAlign: 'middle' }}>APP</span></div>
          <div style={{ fontSize: 11, color: '#b5bac1' }}>Today</div>
        </div>
      </div>
      <div style={{ borderLeft: '4px solid #7c5cff', background: '#1e1f22', borderRadius: 4, padding: '12px 14px' }}>
        <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>📊 Session Summary · {profileName}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          <div><div style={{ color: '#b5bac1', fontSize: 11 }}>Runtime</div><div style={{ color: '#fff' }}>01:24:30</div></div>
          <div><div style={{ color: '#b5bac1', fontSize: 11 }}>Loops</div><div style={{ color: '#fff' }}>42</div></div>
          <div><div style={{ color: '#b5bac1', fontSize: 11 }}>Runs / Hour</div><div style={{ color: '#fff' }}>29.8</div></div>
          <div><div style={{ color: '#b5bac1', fontSize: 11 }}>Status</div><div style={{ color: '#4ad991' }}>✅ Success</div></div>
        </div>
        <div style={{ color: '#6d7178', fontSize: 11, marginTop: 10 }}>Shadow Macro · TDS Suite</div>
      </div>
    </div>
  );
}

export default function Webhooks() {
  const profile = useStore((s) => s.getActiveProfile());
  const updateProfile = useStore((s) => s.updateProfile);
  const [testState, setTestState] = useState(null); // null | 'sending' | 'ok' | 'fail'
  if (!profile) return null;
  const wh = profile.webhook;
  const set = (patch) => updateProfile(profile.id, { webhook: { ...wh, ...patch } });

  async function testWebhook() {
    setTestState('sending');
    const res = await bridge.webhook.test(profile);
    setTestState(res?.ok ? 'ok' : 'fail');
    setTimeout(() => setTestState(null), 3500);
  }

  const toggles = [
    ['sessionSummary', 'Session summaries', 'Sent when a session finishes'],
    ['runtimeReports', 'Runtime reports', 'Periodic progress updates during a session'],
    ['completionReports', 'Completion reports', 'When a loop target is reached'],
    ['errorNotifications', 'Error notifications', 'Alerts if the macro encounters a problem'],
  ];

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start', gap: 16 }}>
      <div className="grid" style={{ gap: 16 }}>
        <div className="panel">
          <div className="row between">
            <div className="panel-title" style={{ margin: 0 }}>Webhook · {profile.name}</div>
            <label className="toggle">
              <input type="checkbox" checked={wh.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
              <span className="track" />
            </label>
          </div>
          <div className="divider" />
          <label className="field">
            <span className="lbl">Webhook URL</span>
            <input type="url" placeholder="https://discord.com/api/webhooks/..." value={wh.url} onChange={(e) => set({ url: e.target.value })} />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="lbl">Custom Username</span>
              <input type="text" value={wh.username} onChange={(e) => set({ username: e.target.value })} />
            </label>
            <label className="field">
              <span className="lbl">Avatar URL</span>
              <input type="url" placeholder="https://..." value={wh.avatarUrl} onChange={(e) => set({ avatarUrl: e.target.value })} />
            </label>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={testWebhook} disabled={!wh.url || testState === 'sending'}>
              {testState === 'sending' ? 'Sending…' : '📨 Send Test Message'}
            </button>
            {testState === 'ok' && <span className="badge badge-good">✓ Delivered</span>}
            {testState === 'fail' && <span className="badge badge-bad">✕ Failed (check URL / desktop app)</span>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Notifications</div>
          <div className="grid" style={{ gap: 10 }}>
            {toggles.map(([key, label, desc]) => (
              <label className="row between" key={key} style={{ cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{desc}</div>
                </div>
                <span className="toggle">
                  <input type="checkbox" checked={wh[key]} onChange={(e) => set({ [key]: e.target.checked })} />
                  <span className="track" />
                </span>
              </label>
            ))}
          </div>
          {wh.runtimeReports && (
            <label className="field" style={{ marginTop: 14, marginBottom: 0 }}>
              <span className="lbl">Runtime report interval (minutes)</span>
              <input
                type="number" min="1" value={wh.runtimeReportMinutes ?? 15}
                onChange={(e) => set({ runtimeReportMinutes: Number(e.target.value) })}
                style={{ maxWidth: 160 }}
              />
            </label>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Rich Embed Preview</div>
        <EmbedPreview wh={wh} profileName={profile.name} />
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12 }}>
          Reports are delivered as real Discord rich embeds by the core engine during sessions. Use “Send Test
          Message” to verify your webhook. (Sending requires the desktop app; the web preview can’t reach Discord.)
        </div>
      </div>
    </div>
  );
}
