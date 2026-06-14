import React from 'react';
import { useStore } from '../store/useStore.js';
import EngineControls from '../components/EngineControls.jsx';
import { fmtClock, runsPerHour, fmtNumber } from '../lib/format.js';
import { MACRO_STAGES } from '../data/presets.js';

function StatCard({ label, value, accent }) {
  return (
    <div className="stat-card">
      <div className="glow" style={{ background: accent }} />
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export default function TdsDashboard({ setPage }) {
  const engine = useStore((s) => s.engine);
  const profile = useStore((s) => s.getActiveProfile());
  const testMode = useStore((s) => s.settings.testMode);

  const rph = runsPerHour(engine.elapsedMs, engine.loopsCompleted);

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* Hero / live control */}
      <div className="panel" style={{ background: 'linear-gradient(135deg, rgba(124,92,255,0.12), rgba(11,14,20,0.4))' }}>
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 14 }}>
            <div style={{ fontSize: 34 }}>{profile?.icon || '🛡️'}</div>
            <div>
              <div className="row" style={{ gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{profile?.name || 'No profile'}</h2>
                {testMode && <span className="badge badge-warn">TEST MODE</span>}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 2 }}>
                Macro: <strong style={{ color: 'var(--text)' }}>{profile?.macroName || '—'}</strong>
                {' · '}Delay preset: <span className="chip">{profile?.delayPreset || 'average'}</span>
              </div>
            </div>
          </div>
          <EngineControls />
        </div>

        {engine.status === 'countdown' && (
          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 60, fontWeight: 800, color: 'var(--accent-2)' }}>{engine.countdown}</div>
            <div style={{ color: 'var(--text-dim)' }}>Session countdown — get ready…</div>
          </div>
        )}
      </div>

      {/* Live stats */}
      <div className="grid grid-4">
        <StatCard label="Session Runtime" value={fmtClock(engine.elapsedMs)} accent="var(--accent-2)" />
        <StatCard label="Runs Completed" value={fmtNumber(engine.loopsCompleted)} accent="var(--accent)" />
        <StatCard label="Est. Runs / Hour" value={rph ? rph.toFixed(1) : '—'} accent="var(--good)" />
        <StatCard label="Current Stage" value={MACRO_STAGES.find((s) => s.id === engine.currentStageId)?.name?.replace(' Actions', '') || 'Idle'} accent="var(--warn)" />
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {/* Stage pipeline */}
        <div className="panel">
          <div className="panel-title">Macro Pipeline</div>
          <div className="grid" style={{ gap: 8 }}>
            {MACRO_STAGES.map((stage) => {
              const active = engine.currentStageId === stage.id && engine.status === 'running';
              return (
                <div
                  key={stage.id}
                  className="row between"
                  style={{
                    padding: '12px 14px', borderRadius: 10,
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-soft)'}`,
                    background: active ? 'rgba(124,92,255,0.1)' : 'var(--bg-1)',
                    transition: 'all 0.2s',
                  }}
                >
                  <div className="row" style={{ gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{stage.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{stage.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{stage.actions.length} actions</div>
                    </div>
                  </div>
                  {active ? <span className="badge badge-good"><span className="dot run" /> Active</span> : <span className="chip">Queued</span>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-sm" onClick={() => setPage('macro')}>Edit Macro →</button>
          </div>
        </div>

        {/* Live log */}
        <div className="panel">
          <div className="panel-title">Live Session Log</div>
          <div className="log">
            {engine.log.length === 0 ? (
              <div style={{ color: 'var(--text-faint)' }}>No activity yet. Press Start Macro to begin a session.</div>
            ) : (
              engine.log.map((l, i) => (
                <div key={i}><span className="t">{l.t}</span>{l.msg}</div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
