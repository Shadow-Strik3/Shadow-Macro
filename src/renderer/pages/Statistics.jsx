import React from 'react';
import { useStore } from '../store/useStore.js';
import { fmtDuration, fmtNumber } from '../lib/format.js';

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card">
      <div className="glow" style={{ background: accent }} />
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function Statistics() {
  const stats = useStore((s) => s.getStats());
  const history = useStore((s) => s.history);
  const successRate = stats.totalRuns ? Math.round((stats.successes / stats.totalRuns) * 100) : 0;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="grid grid-3">
        <StatCard label="Total Runtime" value={fmtDuration(stats.totalRuntimeMs)} accent="var(--accent-2)" />
        <StatCard label="Total Runs Completed" value={fmtNumber(stats.totalRuns)} accent="var(--accent)" />
        <StatCard label="Total Loops Completed" value={fmtNumber(stats.totalLoops)} accent="var(--good)" />
      </div>
      <div className="grid grid-3">
        <StatCard label="Longest Session" value={fmtDuration(stats.longestMs)} accent="var(--warn)" />
        <StatCard label="Most-Used Macro" value={stats.mostUsed} accent="var(--accent)" />
        <StatCard label="Total Coins (tracked)" value={fmtNumber(stats.totalCoins)} sub={`${successRate}% success rate`} accent="var(--warn)" />
      </div>

      <div className="panel">
        <div className="panel-title">Performance Overview</div>
        {history.length === 0 ? (
          <div className="empty"><div className="big">📈</div>Run sessions to build up lifetime statistics.</div>
        ) : (
          <div className="grid grid-2">
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Success Rate</div>
              <div style={{ height: 12, borderRadius: 99, background: 'var(--bg-0)', overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
                <div style={{ width: `${successRate}%`, height: '100%', background: 'linear-gradient(90deg, var(--good), #2faf6e)' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>{stats.successes} of {stats.totalRuns} sessions completed successfully.</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Averages</div>
              <div className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <span style={{ color: 'var(--text-dim)' }}>Avg. session length</span>
                <strong>{fmtDuration(stats.totalRuntimeMs / Math.max(stats.totalRuns, 1))}</strong>
              </div>
              <div className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <span style={{ color: 'var(--text-dim)' }}>Avg. loops / session</span>
                <strong>{(stats.totalLoops / Math.max(stats.totalRuns, 1)).toFixed(1)}</strong>
              </div>
              <div className="row between" style={{ padding: '6px 0' }}>
                <span style={{ color: 'var(--text-dim)' }}>Avg. coins / session</span>
                <strong>{fmtNumber(Math.round(stats.totalCoins / Math.max(stats.totalRuns, 1)))}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
