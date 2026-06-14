import React from 'react';
import { useStore } from '../store/useStore.js';

const TITLES = {
  dashboard: ['TDS Dashboard', 'Live overview of your farming session'],
  profiles: ['Profiles', 'Configure macros, loops, delays and webhooks per profile'],
  macro: ['Macro Builder', 'Compose your TDS automation in four stages'],
  history: ['Run History', 'Every session recorded and exportable'],
  stats: ['Statistics', 'Lifetime performance across all runs'],
  webhooks: ['Discord Webhooks', 'Rich embeds, reports and notifications'],
  settings: ['Settings', 'Startup, system and session behavior'],
};

export default function Topbar({ page }) {
  const [title, sub] = TITLES[page] || TITLES.dashboard;
  const engine = useStore((s) => s.engine);

  const statusMap = {
    idle: { dot: 'off', label: 'Idle' },
    countdown: { dot: 'pause', label: `Starting in ${engine.countdown}s` },
    running: { dot: 'run', label: 'Running' },
    paused: { dot: 'pause', label: 'Paused' },
  };
  const st = statusMap[engine.status] || statusMap.idle;

  return (
    <header className="topbar">
      <div>
        <h2>{title}</h2>
        <div className="sub">{sub}</div>
      </div>
      <div className="row">
        <span className="badge badge-dim">
          <span className={`dot ${st.dot}`} /> {st.label}
        </span>
      </div>
    </header>
  );
}
