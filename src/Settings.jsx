import React, { useEffect, useMemo, useRef, useState } from 'react';
import { settingGroups, normalizeOverrides, displayedSettings } from '../shared/settings.js';

function VectorInput({ definition, value, onChange, ...props }) {
  const encoded = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(encoded);
  useEffect(() => setDraft(encoded), [encoded]);
  return <textarea {...props} rows={4} value={draft} onChange={event => {
    const text = event.target.value; setDraft(text);
    try { const parsed = JSON.parse(text); normalizeOverrides({ [definition.key]: parsed }); event.target.setCustomValidity(''); onChange(parsed); }
    catch (problem) { event.target.setCustomValidity(problem.message); }
  }} onBlur={event => event.target.reportValidity()}/>;
}

function SettingInput({ definition, value, disabled, change }) {
  const { key, label, type, unit, options, optionLabels, min, max, integer, tooltip } = definition;
  const input = useRef();
  useEffect(() => {
    if (!input.current) return;
    try { if (!disabled) normalizeOverrides({ [key]: value }); input.current.setCustomValidity(''); }
    catch (problem) { input.current.setCustomValidity(problem.message); }
  }, [key, value, disabled]);
  const props = { ref: input, id: `setting-${key}`, 'aria-label': label, disabled, title: tooltip, 'data-setting-key': key };
  function validate(event) {
    try { normalizeOverrides({ [key]: event.target.value }); event.target.setCustomValidity(''); }
    catch (problem) { event.target.setCustomValidity(problem.message); }
  }
  if (type === 'boolean') return <input {...props} type="checkbox" checked={value === true || value === '1' || value === 1} onChange={event => change(event.target.checked)}/>;
  if (type === 'enum') return <select {...props} value={value} onChange={event => change(event.target.value)}>
    {!options.includes(value) && <option value={value}>{value || 'Not in preset'}</option>}
    {options.map(option => <option value={option} key={option}>{optionLabels?.[option] || option}</option>)}
  </select>;
  if (type === 'vector') return <VectorInput {...props} definition={definition} value={value} onChange={change}/>;
  if (type === 'string' && definition.multiline) return <textarea {...props} rows={4} value={value} onChange={event => { validate(event); change(event.target.value); }}/>;
  return <span className="value"><input {...props} type={type === 'number' ? 'number' : 'text'} min={type === 'number' && min > -1e10 ? min : undefined} max={type === 'number' && max < 1e10 ? max : undefined} step={integer ? 1 : 'any'} value={value} placeholder="—" list={type === 'floatOrPercent' && options ? `suggestions-${key}` : undefined} onChange={event => { validate(event); change(event.target.value); }} onBlur={event => event.target.reportValidity()}/><em>{unit}</em>{type === 'floatOrPercent' && options && <datalist id={`suggestions-${key}`}>{options.map(option => <option key={option} value={option}>{optionLabels?.[option]}</option>)}</datalist>}</span>;
}

export default function Settings({ catalog, ids, changePreset, resolved, overrides, changeSetting, reset, resetSetting, pending, PresetSelect, compare, editPreset, embedded, embeddedProcessName, catalogPending, state, reviewCorrections, editObjectSettings, hasSelectedObject }) {
  const displayedOverrides = useMemo(() => displayedSettings(overrides), [overrides]);
  const [tab, setTab] = useState('Quality'), [search, setSearch] = useState('');
  const [mode, setMode] = useState(() => localStorage.getItem('orca-web-setting-mode') || 'Expert');
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (query ? Object.values(settingGroups).flat() : settingGroups[tab] || []).filter(row => {
      const matches = !query || `${row.label} ${row.fullLabel} ${row.key} ${row.tooltip} ${row.ui.group}`.toLowerCase().includes(query);
      const visible = mode === 'Expert' || mode === 'Advanced' && row.mode !== 'comExpert' || row.mode === 'comSimple';
      return matches && (query || visible && state?.fields?.process?.[row.key]?.visible !== false);
    });
  }, [tab, search, mode, state]);
  return <aside className="settings">
    <div className="preset-head"><b>Process</b><PresetSelect label="Process preset" loading={catalogPending} embeddedName={embeddedProcessName} options={catalog.processes} value={ids.processId} onChange={value => changePreset('processId', value)} disabled={pending || embedded}/><button aria-label="Edit process preset" onClick={editPreset} disabled={pending || embedded || !ids.processId} title="Edit and save a custom process preset">▣</button></div>
    <div className="mode-row"><div><button className="on" aria-pressed="true">Global</button><button onClick={editObjectSettings} disabled={pending||!hasSelectedObject} title={hasSelectedObject?'Edit native object and part settings':'Select an object to edit its settings'}>Objects</button></div><select aria-label="Settings mode" value={mode} onChange={event => { setMode(event.target.value); localStorage.setItem('orca-web-setting-mode', event.target.value); }}>{['Simple','Advanced','Expert'].map(name => <option key={name}>{name}</option>)}</select></div>
    <label className="search"><span>⌕</span><input aria-label="Search settings" placeholder="Search settings" value={search} onChange={event => setSearch(event.target.value)}/></label>
    <div className="setting-tabs">{Object.keys(settingGroups).map(name => <button className={tab === name && !search ? 'active' : ''} onClick={() => { setTab(name); setSearch(''); }} key={name}>{name}</button>)}</div>
    {!resolved && <p className="settings-message">{pending ? 'Loading preset settings…' : 'Select available native presets to load settings.'}</p>}
    {state?.decisionError&&<p role="alert" className="settings-message">{state.decisionError} <button onClick={reset}>Reset native choices</button></p>}
    {state?.corrections.some(item=>item.scope==='process'&&item.mode!=='automatic')&&<p className="settings-message">Native settings need related changes. <button onClick={reviewCorrections}>Review required changes</button></p>}
    <div className="setting-list">{rows.map((definition, index) => {
      const { key, label, type, ui, tooltip } = definition;
      const defaultValue = resolved?.settings?.[key], value = displayedOverrides[key] ?? defaultValue ?? (type === 'vector' ? [] : '');
      const dependency = state?.fields?.process?.[key];
      const hostScript = key === 'post_process';
      return <React.Fragment key={key}>{(index === 0 || rows[index - 1].ui.group !== ui.group || rows[index - 1].ui.page !== ui.page) && <h3>{search && `${ui.page} · `}{ui.group}</h3>}
        <div className={`setting-row ${Object.hasOwn(overrides, key) ? 'overridden' : ''} ${type === 'vector' || definition.multiline ? 'wide-value' : ''}`} data-setting-row={key}>
          <label htmlFor={`setting-${key}`} title={`${tooltip}\nNative key: ${key}`}>{label}</label>
          <SettingInput definition={dependency?.options ? {...definition, options: dependency.options} : definition} value={value} disabled={pending || !resolved || defaultValue === undefined || hostScript || dependency?.enabled === false || dependency?.visible === false} change={next => changeSetting(key, next)}/>
          {Object.hasOwn(overrides, key) && <button className="setting-reset" aria-label={`Reset ${label}`} onClick={() => resetSetting(key)} title="Restore selected preset value">↶</button>}
          {dependency?.reasons?.length > 0 && <small className="setting-note">{dependency.reasons.join(' ')}</small>}
          {hostScript && <small className="setting-note">Host scripts are disabled on this web server.</small>}
        </div></React.Fragment>;
    })}{!rows.length && <p className="settings-message">No settings match this search.</p>}</div>
    <div className="settings-foot"><button onClick={reset} disabled={pending || Object.keys(overrides).length === 0}>↶ Reset</button><button onClick={compare} disabled={!resolved || pending || embedded}>Compare presets</button><small>{rows.length} shown · OrcaSlicer 2.4.2</small></div>
  </aside>;
}
