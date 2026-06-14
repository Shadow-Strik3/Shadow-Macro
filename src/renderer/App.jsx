import React, { useEffect, useState } from 'react';
import { useStore } from './store/useStore.js';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import TdsDashboard from './pages/TdsDashboard.jsx';
import Profiles from './pages/Profiles.jsx';
import MacroBuilder from './pages/MacroBuilder.jsx';
import RunHistory from './pages/RunHistory.jsx';
import Statistics from './pages/Statistics.jsx';
import Webhooks from './pages/Webhooks.jsx';
import Settings from './pages/Settings.jsx';

const PAGES = {
  dashboard: TdsDashboard,
  profiles: Profiles,
  macro: MacroBuilder,
  history: RunHistory,
  stats: Statistics,
  webhooks: Webhooks,
  settings: Settings,
};

export default function App() {
  const [page, setPage] = useState('dashboard');
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Tray commands (Start/Pause/Stop) are handled directly in the main process,
  // which drives the shared engine; the renderer just reflects engine:state.

  if (!hydrated) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#98a3b8' }}>
        Loading Shadow Macro…
      </div>
    );
  }

  const Page = PAGES[page] || TdsDashboard;

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} />
      <div className="main">
        <Topbar page={page} setPage={setPage} />
        <div className="content">
          <Page setPage={setPage} />
        </div>
      </div>
    </div>
  );
}
