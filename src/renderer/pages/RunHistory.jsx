import React from 'react';
import { useStore } from '../store/useStore.js';
import { fmtDuration, fmtDateTime, fmtNumber } from '../lib/format.js';

function statusBadge(status) {
  if (status === 'success') return <span className="badge badge-good">Success</span>;
  if (status === 'failure') return <span className="badge badge-bad">Failure</span>;
  return <span className="badge badge-warn">Stopped</span>;
}

function toCSV(rows) {
  const header = ['Date/Time', 'Macro', 'Profile', 'Duration (s)', 'Loops', 'Coins', 'Status', 'Test Mode'];
  const lines = [header.join(',')];
  rows.forEach((r) => {
    const cells = [
      new Date(r.dateTime).toISOString(),
      r.macro,
      r.profileName,
      Math.round((r.durationMs || 0) / 1000),
      r.loops || 0,
      r.coins ?? '',
      r.status,
      r.testMode ? 'yes' : 'no',
    ].map((c) => {
      const s = String(c ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(','));
  });
  return lines.join('\n');
}

export default function RunHistory() {
  const history = useStore((s) => s.history);
  const setCoins = useStore((s) => s.setRunCoins);
  const deleteRun = useStore((s) => s.deleteRun);
  const clearHistory = useStore((s) => s.clearHistory);

  function exportCSV() {
    const csv = toCSV(history);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shadow-macro-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="panel-title" style={{ margin: 0 }}>Run History · {history.length} sessions</div>
        <div className="row">
          <button className="btn btn-sm" onClick={exportCSV} disabled={!history.length}>⬇ Export CSV</button>
          <button className="btn btn-sm btn-bad" onClick={() => { if (confirm('Clear all run history?')) clearHistory(); }} disabled={!history.length}>Clear</button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="empty">
          <div className="big">🕑</div>
          No sessions recorded yet. Run a macro from the dashboard to populate your history.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Macro</th>
                <th>Profile</th>
                <th>Duration</th>
                <th>Loops</th>
                <th>Coins</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.dateTime)}</td>
                  <td>{r.macro} {r.testMode && <span className="chip">test</span>}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{r.profileName}</td>
                  <td>{fmtDuration(r.durationMs)}</td>
                  <td>{fmtNumber(r.loops)}</td>
                  <td>
                    <input
                      type="number" placeholder="—" value={r.coins ?? ''} style={{ width: 90, padding: '4px 6px' }}
                      onChange={(e) => setCoins(r.id, e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </td>
                  <td>{statusBadge(r.status)}</td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => deleteRun(r.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
