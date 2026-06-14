import React from 'react';
import { bridge } from '../lib/bridge.js';

const NAV = [
  { group: 'TDS' },
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'profiles', icon: '👤', label: 'Profiles' },
  { id: 'macro', icon: '🧩', label: 'Macro Builder' },
  { group: 'Tracking' },
  { id: 'history', icon: '🕑', label: 'Run History' },
  { id: 'stats', icon: '📈', label: 'Statistics' },
  { group: 'Integrations' },
  { id: 'webhooks', icon: '🔔', label: 'Discord Webhooks' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
];

export default function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">🛡️</div>
        <div className="brand-text">
          <h1>Shadow Macro</h1>
          <span>TDS Suite</span>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((item, i) =>
          item.group ? (
            <div className="nav-label" key={`g-${i}`}>{item.group}</div>
          ) : (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="ico">{item.icon}</span>
              {item.label}
            </button>
          )
        )}
      </nav>

      <div className="sidebar-foot">
        <button className="nav-item" onClick={() => bridge.window.minimizeToTray()}>
          <span className="ico">🗕</span> Minimize to Tray
        </button>
        <button className="nav-item" onClick={() => bridge.app.exit()}>
          <span className="ico">⏻</span> Exit
        </button>
        <div style={{ padding: '10px 11px', fontSize: 11, color: 'var(--text-faint)' }}>
          v1.0.0 {bridge.isElectron ? '· Desktop' : '· Web Preview'}
        </div>
      </div>
    </aside>
  );
}
