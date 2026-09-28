import Modal from './Modal.jsx';
import React, { useEffect, useState } from 'react';
import { settingDefinitions, displayedSettings } from '../shared/settings.js';
const display = value => value === undefined ? '—' : typeof value === 'boolean' ? value ? 'Enabled' : 'Disabled' : Array.isArray(value) ? JSON.stringify(value) : String(value);
export default function PresetCompare({ catalog, ids, resolved, overrides, onClose }) {
  const [target, setTarget] = useState(ids.processId), [other, setOther] = useState(null), [error, setError] = useState('');
  const [onlyDifferent, setOnlyDifferent] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setOther(null); setError('');
    fetch(`/api/presets/selection?${new URLSearchParams({ ...ids, processId: target })}`, { signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!controller.signal.aborted) setOther(result); }).catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [ids.printerId, ids.filamentId, target]);
  const current = displayedSettings({ ...resolved.settings, ...overrides });
  const rows = settingDefinitions.filter(row => !onlyDifferent || display(current[row.key]) !== display(other?.settings[row.key]));
  return <Modal className="compare-dialog" aria-label="Compare process presets" onClose={onClose}><h2>Compare process presets</h2><div className="compare-selectors"><span>Current: {resolved.process.name} {Object.keys(overrides).length > 0 && '(modified)'}</span><label>Compare with<select aria-label="Comparison preset" value={target} onChange={event => setTarget(event.target.value)}>{catalog.processes.map(preset => <option value={preset.id} key={preset.id}>{preset.name}</option>)}</select></label><label><input type="checkbox" checked={onlyDifferent} onChange={event => setOnlyDifferent(event.target.checked)}/> Differences only</label></div>{error && <p role="alert">{error}</p>}{!other ? <p>Loading comparison…</p> : <div className="compare-table"><table><thead><tr><th>Setting</th><th>Current value</th><th>Comparison value</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><th>{row.ui.page} · {row.fullLabel || row.label}</th><td>{display(current[row.key])}</td><td>{display(other.settings[row.key])}</td></tr>)}</tbody></table>{!rows.length && <p>No differences.</p>}</div>}<button autoFocus onClick={onClose}>Close comparison</button></Modal>;
}
