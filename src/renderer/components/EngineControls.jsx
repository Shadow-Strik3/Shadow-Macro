import React from 'react';
import { useStore } from '../store/useStore.js';

export default function EngineControls() {
  const engine = useStore((s) => s.engine);
  const start = useStore((s) => s.startMacro);
  const pause = useStore((s) => s.pauseMacro);
  const resume = useStore((s) => s.resumeMacro);
  const stop = useStore((s) => s.stopMacro);

  const running = engine.status === 'running' || engine.status === 'countdown';
  const paused = engine.status === 'paused';

  return (
    <div className="row wrap">
      {!running && !paused && (
        <button className="btn btn-good" onClick={start}>▶ Start Macro</button>
      )}
      {running && (
        <button className="btn btn-warn" onClick={pause} disabled={engine.status === 'countdown'}>⏸ Pause</button>
      )}
      {paused && (
        <button className="btn btn-good" onClick={resume}>▶ Resume</button>
      )}
      <button className="btn btn-bad" onClick={() => stop('stopped')} disabled={engine.status === 'idle'}>
        ⏹ Stop
      </button>
    </div>
  );
}
