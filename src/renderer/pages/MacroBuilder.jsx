import React, { useEffect, useRef, useState } from 'react';
import { MACRO_STAGES, defaultMacro } from '../data/presets.js';
import { STEP_TYPES, stepSummary, newStep } from '../data/steps.js';
import { useStore } from '../store/useStore.js';
import { bridge } from '../lib/bridge.js';

// Macro builder with a live input recorder + full manual step editing.
// Each step is a concrete, executable action (click/key/wait/…) saved per
// profile and run by the core engine's real input driver.

export default function MacroBuilder() {
  const profile = useStore((s) => s.getActiveProfile());
  const getMacro = useStore((s) => s.getMacro);
  const saveMacro = useStore((s) => s.saveMacro);
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const startMacro = useStore((s) => s.startMacro);

  const [macro, setMacro] = useState(
    () => getMacro(profile?.id) || defaultMacro(profile?.macroName || 'New Macro', profile?.id)
  );
  const [saved, setSaved] = useState(false);
  const [targetStage, setTargetStage] = useState('match'); // stage that receives recorded/added steps
  const [recording, setRecording] = useState(false);
  const [recAvailable, setRecAvailable] = useState(false);
  const [inputAvailable, setInputAvailable] = useState(false);
  const macroRef = useRef(macro);
  macroRef.current = macro;

  useEffect(() => {
    setMacro(getMacro(profile?.id) || defaultMacro(profile?.macroName || 'New Macro', profile?.id));
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capability probes (real recorder / input driver only exist in desktop app).
  useEffect(() => {
    bridge.recorder.available().then(setRecAvailable);
    bridge.input.available().then(setInputAvailable);
  }, []);

  // Live recorder: append each captured step into the target stage.
  useEffect(() => {
    const offStep = bridge.recorder.onStep((step) => {
      const m = macroRef.current;
      const next = {
        ...m,
        stages: m.stages.map((s) => (s.stageId === targetStage ? { ...s, steps: [...s.steps, step] } : s)),
      };
      persist(next);
    });
    return offStep;
  }, [targetStage]); // eslint-disable-line react-hooks/exhaustive-deps

  function persist(next) {
    setMacro(next);
    saveMacro(profile?.id, next);
    setSaved(true);
    clearTimeout(window.__smSaveTimer);
    window.__smSaveTimer = setTimeout(() => setSaved(false), 1200);
  }

  function mutateStage(stageId, fn) {
    persist({ ...macro, stages: macro.stages.map((s) => (s.stageId === stageId ? fn(s) : s)) });
  }
  function toggleStage(stageId) {
    mutateStage(stageId, (s) => ({ ...s, enabled: !s.enabled }));
  }
  function updateStep(stageId, stepId, patch) {
    mutateStage(stageId, (s) => ({ ...s, steps: s.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)) }));
  }
  function deleteStep(stageId, stepId) {
    mutateStage(stageId, (s) => ({ ...s, steps: s.steps.filter((st) => st.id !== stepId) }));
  }
  function addStep(stageId, type) {
    mutateStage(stageId, (s) => ({ ...s, steps: [...s.steps, newStep(type)] }));
  }
  function moveStep(stageId, index, dir) {
    mutateStage(stageId, (s) => {
      const steps = [...s.steps];
      const j = index + dir;
      if (j < 0 || j >= steps.length) return s;
      [steps[index], steps[j]] = [steps[j], steps[index]];
      return { ...s, steps };
    });
  }
  function clearStage(stageId) {
    if (!confirm('Remove all steps from this stage?')) return;
    mutateStage(stageId, (s) => ({ ...s, steps: [] }));
  }

  async function toggleRecording() {
    if (recording) {
      await bridge.recorder.stop();
      setRecording(false);
      return;
    }
    const res = await bridge.recorder.start({ captureMoves: false });
    if (res?.ok) setRecording(true);
    else alert(`Could not start recorder: ${res?.reason || 'unavailable'}.\nThe live recorder requires the desktop app with the native input hook installed.`);
  }

  const totalSteps = macro.stages.reduce((a, s) => a + s.steps.length, 0);
  const enabledSteps = macro.stages.reduce((a, s) => a + (s.enabled ? s.steps.filter((x) => x.enabled).length : 0), 0);

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* Header / recorder bar */}
      <div className="panel">
        <div className="row between wrap" style={{ gap: 12 }}>
          <label className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
            <span className="lbl">Macro Name · {profile?.name}</span>
            <input type="text" value={macro.name} onChange={(e) => persist({ ...macro, name: e.target.value })} />
          </label>
          <div className="row wrap" style={{ alignSelf: 'flex-end', gap: 8 }}>
            {saved && <span className="badge badge-good">✓ Saved</span>}
            <span className="chip">{totalSteps} steps · {enabledSteps} active</span>
            <label className="toggle">
              <input type="checkbox" checked={settings.testMode} onChange={(e) => setSetting('testMode', e.target.checked)} />
              <span className="track" />
              <span>Test</span>
            </label>
            <button className="btn btn-good" onClick={startMacro}>▶ {settings.testMode ? 'Test Run' : 'Run'}</button>
          </div>
        </div>

        <div className="divider" />

        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className={`btn ${recording ? 'btn-bad' : 'btn-primary'}`} onClick={toggleRecording}>
              {recording ? '⏺ Stop Recording' : '⏺ Record Inputs'}
            </button>
            <label className="row" style={{ gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Record into:</span>
              <select value={targetStage} onChange={(e) => setTargetStage(e.target.value)} style={{ width: 'auto' }}>
                {MACRO_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            {recording && <span className="badge badge-bad"><span className="dot run" /> Recording — your clicks & keys are being captured</span>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className={`badge ${recAvailable ? 'badge-good' : 'badge-dim'}`}>{recAvailable ? 'Recorder ready' : 'Recorder N/A (web)'}</span>
            <span className={`badge ${inputAvailable ? 'badge-good' : 'badge-dim'}`}>{inputAvailable ? 'Real input ready' : 'Input mock'}</span>
          </div>
        </div>
      </div>

      {/* Stages */}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {MACRO_STAGES.map((stageDef, idx) => {
          const stage = macro.stages.find((s) => s.stageId === stageDef.id);
          if (!stage) return null;
          const isTarget = targetStage === stageDef.id;
          return (
            <div className="stage-card" key={stageDef.id} style={isTarget && recording ? { boxShadow: '0 0 0 2px var(--bad)' } : undefined}>
              <div className="stage-head">
                <span style={{ fontSize: 18 }}>{stageDef.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>
                    <span style={{ color: 'var(--text-faint)', marginRight: 6 }}>{idx + 1}.</span>
                    {stageDef.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{stage.steps.length} steps</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={stage.enabled} onChange={() => toggleStage(stageDef.id)} />
                  <span className="track" />
                </label>
              </div>

              <div className="stage-body" style={{ opacity: stage.enabled ? 1 : 0.5 }}>
                {stage.steps.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '6px 2px' }}>
                    No steps yet. Record inputs or add a step below.
                  </div>
                )}
                {stage.steps.map((step, i) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    first={i === 0}
                    last={i === stage.steps.length - 1}
                    onChange={(patch) => updateStep(stageDef.id, step.id, patch)}
                    onDelete={() => deleteStep(stageDef.id, step.id)}
                    onMove={(dir) => moveStep(stageDef.id, i, dir)}
                  />
                ))}

                <div className="row between" style={{ marginTop: 8 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <select
                      onChange={(e) => { if (e.target.value) { addStep(stageDef.id, e.target.value); e.target.value = ''; } }}
                      defaultValue=""
                      style={{ width: 'auto', fontSize: 12, padding: '5px 8px' }}
                    >
                      <option value="" disabled>＋ Add step…</option>
                      {Object.values(STEP_TYPES).map((t) => (
                        <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                      ))}
                    </select>
                  </div>
                  {stage.steps.length > 0 && (
                    <button className="btn btn-sm btn-ghost" onClick={() => clearStage(stageDef.id)}>Clear</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel" style={{ background: 'rgba(124,92,255,0.06)' }}>
        <div className="row" style={{ gap: 10, color: 'var(--text-dim)', fontSize: 13 }}>
          <span style={{ fontSize: 18 }}>ℹ️</span>
          <div>
            Recorded steps are saved per profile and executed by the core engine in order, each repeated as configured.
            On the desktop app with the native input modules installed, clicks/keys are sent for real; otherwise steps
            are logged (mock). Use <b>Test</b> mode to dry-run without recording history or sending input.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function StepEditor({ step, first, last, onChange, onDelete, onMove }) {
  const def = STEP_TYPES[step.type] || STEP_TYPES.action;
  const [open, setOpen] = useState(false);

  return (
    <div className="step-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
      <div className="row" style={{ gap: 8 }}>
        <span style={{ fontSize: 14 }}>{def.icon}</span>
        <label className="toggle" style={{ flex: 1, minWidth: 0 }}>
          <input type="checkbox" checked={step.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          <span className="track" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stepSummary(step)}</span>
        </label>
        <div className="row" style={{ gap: 2 }}>
          <button className="btn btn-sm btn-ghost" title="Move up" disabled={first} onClick={() => onMove(-1)}>↑</button>
          <button className="btn btn-sm btn-ghost" title="Move down" disabled={last} onClick={() => onMove(1)}>↓</button>
          <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => setOpen((o) => !o)}>{open ? '▴' : '✎'}</button>
          <button className="btn btn-sm btn-ghost" title="Delete" onClick={onDelete}>✕</button>
        </div>
      </div>

      {open && (
        <div style={{ padding: '10px 2px 4px', display: 'grid', gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Type</label>
            <select value={step.type} onChange={(e) => onChange({ type: e.target.value })} style={{ width: 'auto', fontSize: 12, padding: '4px 6px' }}>
              {Object.values(STEP_TYPES).map((t) => (
                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>

          {/* type-specific fields */}
          {(step.type === 'click' || step.type === 'move') && (
            <div className="row" style={{ gap: 8 }}>
              <NumField label="X" value={step.x} onChange={(v) => onChange({ x: v })} />
              <NumField label="Y" value={step.y} onChange={(v) => onChange({ y: v })} />
              {step.type === 'click' && (
                <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Button{' '}
                  <select value={step.button || 'left'} onChange={(e) => onChange({ button: e.target.value })} style={{ width: 'auto', fontSize: 12, padding: '4px 6px' }}>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="middle">Middle</option>
                  </select>
                </label>
              )}
            </div>
          )}
          {step.type === 'key' && (
            <TextField label="Key (e.g. e, ctrl+a, f5)" value={step.key} onChange={(v) => onChange({ key: v })} />
          )}
          {step.type === 'text' && (
            <TextField label="Text to type" value={step.text} onChange={(v) => onChange({ text: v })} />
          )}
          {step.type === 'wait' && (
            <NumField label="Wait (ms)" value={step.ms} onChange={(v) => onChange({ ms: v })} />
          )}
          {step.type === 'scroll' && (
            <NumField label="Amount (+up / −down)" value={step.amount} onChange={(v) => onChange({ amount: v })} />
          )}

          <div className="row" style={{ gap: 8 }}>
            <NumField label="Repeat ×" value={step.repeat} min={1} onChange={(v) => onChange({ repeat: v })} />
            <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Delay after (ms){' '}
              <input
                type="number" placeholder="auto" value={step.delayAfter ?? ''}
                onChange={(e) => onChange({ delayAfter: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: 80, padding: '4px 6px' }}
              />
            </label>
          </div>

          <TextField label="Label / note (optional)" value={step.value} onChange={(v) => onChange({ value: v })} />
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange, min }) {
  return (
    <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>
      {label}{' '}
      <input type="number" min={min} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 78, padding: '4px 6px' }} />
    </label>
  );
}
function TextField({ label, value, onChange }) {
  return (
    <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block' }}>
      {label}
      <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', padding: '5px 8px', marginTop: 2 }} />
    </label>
  );
}
