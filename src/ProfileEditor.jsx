import PresetDependencies from './PresetDependencies.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { editableDefinitionsByScope, groupsByScope, normalizeProfileOverrides, displayedProfileSettings } from '../shared/profile-settings.js';
import { evaluateSettingsState } from '../shared/settings-dependencies.js';
import './profile-editor.css';

const titles = { machine: 'Printer', filament: 'Filament', process: 'Process' };
const EMPTY_OVERRIDES = Object.freeze({});
const settingLabel = definition => definition.label || definition.fullLabel || definition.key;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => structuredClone(value);
const unavailable = key => key === 'post_process' || /^(?:print_host|printhost_|flashforge_serial_number|printer_agent|host_type)/.test(key) || ['bed_custom_model', 'bed_custom_texture'].includes(key);
const sourceUrl = (scope, id) => `/api/presets/custom/source/${encodeURIComponent(scope)}/${encodeURIComponent(id)}`;
async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text(); let body;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error(`The preset server returned an invalid response (${response.status})`); }
  if (!response.ok) throw Object.assign(new Error(body.error || `Preset request failed (${response.status})`), { status: response.status, preparation: body.preparation });
  return body;
}
const defaultElement = definition => definition.nullable ? null : definition.elementType === 'boolean' || definition.type === 'boolean' ? false
  : definition.elementType === 'enum' || definition.type === 'enum' ? definition.options?.[0] ?? ''
    : definition.elementType === 'number' || definition.type === 'number' ? String(Math.max(0, definition.min || 0)) : '';

function ScalarInput({ definition, value, label, disabled, change, dependency, kind = definition.type }) {
  const inherited = value === null || value === 'nil' || dependency?.overrideChecked === false;
  const displayValue = inherited ? dependency?.inheritedValue ?? '' : value;
  const props = { 'aria-label': label, disabled: disabled || dependency?.enabled === false || inherited, title: dependency?.reasons?.join(' ') || definition.tooltip };
  let input;
  if (kind === 'boolean') input = <input {...props} type="checkbox" checked={displayValue === true || displayValue === '1' || displayValue === 1} onChange={event => change(event.target.checked)}/>;
  else if (kind === 'enum') input = <select {...props} value={displayValue ?? ''} onChange={event => change(event.target.value)}>
    {!definition.options?.includes(value) && <option value={displayValue ?? ''}>{inherited ? 'Inherited' : value || 'Not in preset'}</option>}
    {(definition.options || []).map(option => <option key={option} value={option}>{definition.optionLabels?.[option] || option}</option>)}
  </select>;
  else if (kind === 'string' && definition.multiline) input = <textarea {...props} rows={4} value={displayValue ?? ''} onChange={event => change(event.target.value)}/>;
  else input = <input {...props} type={kind === 'number' ? 'number' : 'text'} value={displayValue ?? ''}
    min={kind === 'number' && definition.min > -1e10 ? definition.min : undefined} max={kind === 'number' && definition.max < 1e10 ? definition.max : undefined}
    step={definition.integer ? 1 : 'any'} onChange={event => change(event.target.value)}/>;
  return <div className={`profile-scalar ${kind === 'boolean' ? 'boolean' : ''}`}>{input}{definition.unit && <small>{definition.unit}</small>}
    {definition.nullable && <label className="profile-inherit"><input type="checkbox" aria-label={`Inherit ${label}`} disabled={disabled || dependency?.overrideEnabled === false} checked={inherited} onChange={event => change(event.target.checked ? null : dependency?.inheritedValue ?? defaultElement({ ...definition, nullable: false }))}/>Inherit</label>}
  </div>;
}

function PointInput({ value, label, disabled, change, delimiter = 'x' }) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[x,]/);
  return <div className="profile-point">{['X', 'Y'].map((axis, index) => <label key={axis}>{axis}<input type="number" step="any" aria-label={`${label} ${axis}`} disabled={disabled} value={values[index] ?? ''} onChange={event => { const next = [values[0] ?? '', values[1] ?? '']; next[index] = event.target.value; change(next.join(delimiter)); }}/></label>)}</div>;
}
function PointsInput({ value, label, disabled, change }) {
  const points = Array.isArray(value) ? value : [];
  return <div className="profile-vector">{points.map((point, index) => <div className="profile-vector-row" key={index}>
    <PointInput value={point} label={`${label} point ${index + 1}`} disabled={disabled} change={next => change(points.map((item, i) => i === index ? next : item))}/>
    <button type="button" aria-label={`Remove ${label} point ${index + 1}`} disabled={disabled} onClick={() => change(points.filter((_, i) => i !== index))}>−</button>
  </div>)}<button type="button" disabled={disabled || points.length >= 1024} onClick={() => change([...points, '0x0'])}>Add point</button></div>;
}

export function ProfileSettingInput({ definition, value, disabled, change, dependency, variantField }) {
  const label = `${settingLabel(definition)} (${definition.key})`;
  if (definition.type === 'vector') {
    const values = Array.isArray(value) ? value : [];
    return <div className="profile-vector">{values.map((item, index) => {
      const state = dependency?.indices?.[index] || dependency;
      if (state?.visible === false) return null;
      return <div className="profile-vector-row" key={index}>
        <span className={`profile-index ${variantField?'profile-variant-index':''}`}>{variantField?.indices[index] ? `${variantField.indices[index].filamentSlot?`Material ${variantField.indices[index].filamentSlot} → `:''}Nozzle ${variantField.indices[index].physicalNozzle} · ${variantField.indices[index].nozzleVolume}${variantField.indices[index].machineMode?` · ${variantField.indices[index].machineMode}`:''}` : index + 1}</span><ScalarInput definition={definition} kind={definition.elementType} value={item} label={`${label} ${index + 1}`} disabled={disabled} dependency={state} change={next => change(values.map((entry, i) => i === index ? next : entry))}/>
        {!variantField?.fixed && <button type="button" aria-label={`Remove ${label} entry ${index + 1}`} disabled={disabled || state?.enabled === false} onClick={() => change(values.filter((_, i) => i !== index))}>−</button>}
      </div>;
    })}{!variantField?.fixed && <button type="button" disabled={disabled || dependency?.enabled === false || values.length >= 1024} onClick={() => change([...values, defaultElement(definition)])}>Add entry</button>}</div>;
  }
  disabled = disabled || dependency?.enabled === false;
  if (definition.type === 'point') return <PointInput value={value} label={label} delimiter="," disabled={disabled} change={change}/>;
  if (definition.type === 'points') return <PointsInput value={value} label={label} disabled={disabled} change={change}/>;
  if (definition.type === 'pointGroups') {
    const groups = Array.isArray(value) ? value : [];
    return <div className="profile-point-groups">{groups.map((group, index) => <fieldset key={index}><legend>Group {index + 1}</legend><PointsInput value={typeof group === 'string' ? group ? group.split(',') : [] : group} label={`${label} group ${index + 1}`} disabled={disabled} change={next => change(groups.map((item, i) => i === index ? next.join(',') : item))}/><button type="button" disabled={disabled} onClick={() => change(groups.filter((_, i) => i !== index))}>Remove group {index + 1}</button></fieldset>)}<button type="button" disabled={disabled || groups.length >= 1024} onClick={() => change([...groups, ''])}>Add point group</button></div>;
  }
  return <ScalarInput definition={definition} value={value} label={label} disabled={disabled} dependency={dependency} change={change}/>;
}

/** Independent modal. Parent refreshes catalogs/selects returned custom IDs in
 * onSaved; this component never edits the global slicing selection directly. */
export default function ProfileEditor({ open, scope = 'machine', selectedId, printerId, printers = [], initialOverrides = EMPTY_OVERRIDES, printerConfig, processConfig, filamentConfig, nativeContext = EMPTY_OVERRIDES, selection = EMPTY_OVERRIDES, projectSettings, filamentIndex = 0, onClose, onSaved }) {
  const dialog = useRef(null), operation = useRef(null), fileInput = useRef(null);
  const [variantChoice,setVariantChoice] = useState(null);
  const [loaded, setLoaded] = useState(null), [draft, setDraft] = useState({}), [edits, setEdits] = useState({});
  const [name, setName] = useState(''), [compatible, setCompatible] = useState([]),[nativeCompatibility,setNativeCompatibility]=useState({});
  const [page, setPage] = useState(''), [search, setSearch] = useState(''), [mode, setMode] = useState('Expert');
  const [review, setReview] = useState(null), [nozzleEdit, setNozzleEdit] = useState(null), [acceptedFlow, setAcceptedFlow] = useState(null);
  const [pending, setPending] = useState(false), [mutating, setMutating] = useState(false), [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState({}), [confirmDelete, setConfirmDelete] = useState(false);
  const definitions = editableDefinitionsByScope[scope] || [], pages = Object.keys(groupsByScope[scope] || {});
  const currentPage = pages.includes(page) ? page : pages[0];
  const initialSignature = JSON.stringify(initialOverrides);
  const contextKey=JSON.stringify({scope,selectedId,selection,projectSettings:projectSettings||nativeContext.projectSettings||{},filamentIndex});
  const editorProjectSettings=variantChoice?.key===contextKey?variantChoice.settings:projectSettings||nativeContext.projectSettings||{};
  const contextSignature=JSON.stringify({selection,projectSettings:editorProjectSettings,filamentIndex});
  function evaluateDraft(settings) {
    const configs = { machine: loaded?.relatedSettings?.printer || printerConfig || {}, process: loaded?.relatedSettings?.process || processConfig || {}, filament: loaded?.relatedSettings?.filament || filamentConfig || {} };
    configs[scope] = { ...configs[scope], ...loaded?.preset, ...settings };
    return evaluateSettingsState({ printer: configs.machine, process: configs.process, filament: configs.filament, context: { ...nativeContext, ...loaded?.context, projectSettings:editorProjectSettings, changedSetting: nozzleEdit || nativeContext.changedSetting, isGlobal: true, isPlate: false } });
  }
  const dependencies = useMemo(() => evaluateDraft(draft), [scope, loaded, draft, printerConfig, processConfig, filamentConfig, nativeContext, nozzleEdit, contextSignature]);
  const visibleField = field => field?.indices ? Object.values(field.indices).some(item => item.visible !== false) : field?.visible !== false;
  const rows = useMemo(() => definitions.filter(item => {
    if (!visibleField(dependencies.fields[scope][item.key])) return false;
    const query = search.trim().toLowerCase();
    if (query) return `${item.label} ${item.fullLabel} ${item.key} ${item.tooltip} ${item.ui.page} ${item.ui.group}`.toLowerCase().includes(query);
    return item.ui.page === currentPage && (mode === 'Expert' || mode === 'Advanced' && item.mode !== 'comExpert' || item.mode === 'comSimple');
  }), [definitions, search, currentPage, mode, dependencies, scope]);
  const dirty = loaded && (!same(draft, loaded.settings) || name !== (loaded.custom ? loaded.name : `${loaded.name} (custom)`) || (loaded.nativeCompatibilityMode ? !same(nativeCompatibility,loaded.nativeCompatibility) : !same(compatible, loaded.compatiblePrinterIds?.length ? loaded.compatiblePrinterIds : printerId ? [printerId] : [])));

  function acceptLoaded(result, includeInitial = true) {
    if (result.type !== scope || !result.settings || typeof result.settings !== 'object') throw new Error('The selected preset has an unexpected scope or setting payload');
    const normalized = includeInitial ? normalizeProfileOverrides(scope, initialOverrides) : {};
    const displayed = displayedProfileSettings(scope, normalized, { includeDefaults: false });
    setLoaded(result); setDraft({ ...clone(result.settings), ...displayed }); setEdits({ ...clone(result.overrides || {}), ...normalized });
    setName(result.custom ? result.name : `${result.name} (custom)`);setNativeCompatibility(clone(result.nativeCompatibility||{}));
    setCompatible(result.compatiblePrinterIds?.length ? result.compatiblePrinterIds : printerId ? [printerId] : []);
    setFieldErrors({}); setConfirmDelete(false); setReview(null); setNozzleEdit(null); setAcceptedFlow(null);
  }
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
    operation.current?.abort();
    if (!open) { setPending(false); setMutating(false); return; }
    const controller = new AbortController(); operation.current = controller;
    setPending(true); setMutating(false); setError(''); setLoaded(null);
    jsonRequest(`${sourceUrl(scope, selectedId)}/context`, { method:'POST',headers:{'Content-Type':'application/json'},body:contextSignature, signal: controller.signal }).then(result => { if (!controller.signal.aborted) acceptLoaded(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [open, scope, selectedId, initialSignature, contextSignature]);
  useEffect(()=>{setSearch('');},[open,scope,selectedId]);
  useEffect(() => () => operation.current?.abort(), []);
  function changeSetting(definition, value) {
    const key = definition.key;
    let change = null;
    const eventKeys = ['nozzle_diameter','enable_prime_tower','enable_wrapping_detection','precise_z_height','timelapse_type','print_sequence','support_type','make_overhang_printable','sparse_infill_rotate_template','layer_height','long_retractions_when_cut','filament_long_retractions_when_cut'];
    if (eventKeys.includes(key)) {
      change = { scope, key };
      if (Array.isArray(value) && value.length === draft[key]?.length) {
        const changedIndices = value.flatMap((item,index) => same(item,draft[key][index]) ? [] : [index]);
        if (changedIndices.length === 1) change.index = changedIndices[0];
      }
      if (key === 'sparse_infill_rotate_template') change.previousValue = draft[key];
      setNozzleEdit(change);
    }
    setReview(null); setAcceptedFlow(null);
    setDraft(current => ({ ...current, [key]: value }));
    const next = { ...edits };
    if (same(value, loaded.settings[key])) { if (Object.hasOwn(loaded.overrides || {}, key)) next[key] = clone(loaded.overrides[key]); else delete next[key]; }
    else next[key] = value;
    setEdits(next);
    let valid = true;
    try { normalizeProfileOverrides(scope, { [key]: value }); }
    catch { valid = false; }
    setFieldErrors(current => {
      const errors = { ...current };
      try { normalizeProfileOverrides(scope, { [key]: value }); delete errors[key]; } catch (cause) { errors[key] = cause.message; }
      return errors;
    });
    // These checkbox events have complete values immediately; numeric edits are
    // reviewed on Save so partially typed numbers never trigger a dialog.
    if (valid && definition.type === 'boolean' && ['precise_z_height','make_overhang_printable'].includes(key) && value === true) save(false, next, { purpose: 'edit', changedSetting: change });
  }
  async function mutate(url, method, body, { deleted = false, saveFlow } = {}) {
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller;
    setPending(true); setMutating(true); setError('');
    try {
      const result = await jsonRequest(url, { method, signal: controller.signal, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (controller.signal.aborted) return;
      await onSaved?.({ ...result, id: result.id || loaded?.id, type: result.type || scope, deleted });
      onClose();
    } catch (cause) { if (!controller.signal.aborted) { if (cause.preparation && saveFlow) showPreparation(cause.preparation, saveFlow); else setError(cause.message); } }
    finally { if (operation.current === controller) { setPending(false); setMutating(false); operation.current = null; } }
  }
  const warningKey = item => item.signature || `${item.scope}:${item.key}:${item.message}`;
  function showPreparation(preparation, flow) {
    const groups = preparation.plan?.groups || [], notices = preparation.unacknowledgedWarnings || [];
    if (groups.length || notices.length) {
      setReview({ ...flow, groups: groups.map(group => ({ ...group, choice: 'apply' })), notices }); setError(''); return false;
    }
    if (preparation.blockingErrors?.length) {
      setReview(null); setError(preparation.blockingErrors.map(item => `${item.key}: ${item.message}`).join(' ')); return false;
    }
    if (preparation.ready !== true) throw new Error('The native preset preparation is incomplete');
    return true;
  }
  async function prepareFlow(flow) {
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller;
    setPending(true); setError('');
    try {
      const create = flow.asNew || !loaded.custom;
      const endpoint = create ? '/api/presets/custom/prepare' : `/api/presets/custom/${encodeURIComponent(loaded.id)}/prepare`;
      const preparation = await jsonRequest(endpoint, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flow.request) });
      if (controller.signal.aborted || !showPreparation(preparation, flow)) return;
      setReview(null);
      if (flow.purpose === 'edit') {
        setAcceptedFlow(flow); setEdits(preparation.settings); setDraft({ ...loaded.settings, ...displayedProfileSettings(scope, preparation.settings, { includeDefaults: false }) }); setNozzleEdit(null); return;
      }
      await mutate(create ? '/api/presets/custom' : `/api/presets/custom/${encodeURIComponent(loaded.id)}`, create ? 'POST' : 'PUT', flow.request, { saveFlow: flow });
    } catch (cause) { if (!controller.signal.aborted) setError(cause.message); }
    finally { if (operation.current === controller) { setPending(false); operation.current = null; } }
  }
  function save(asNew, proposedEdits = edits, options = {}) {
    try {
      const previous = proposedEdits === edits ? acceptedFlow : null;
      const settings = normalizeProfileOverrides(scope, previous?.request.settings || proposedEdits);
      const chosenName = asNew && loaded.custom && name.trim() === loaded.name ? `${name.trim()} copy` : name.trim();
      if (!chosenName) throw new Error('Enter a preset name');
      if (scope !== 'machine' && !loaded.nativeCompatibilityMode && !compatible.length) throw new Error('Select at least one compatible printer');
      const chosenSelection = { ...(loaded.nativeEditor?loaded.editorContext.selection:selection) };
      if (scope !== 'machine' && !loaded.nativeCompatibilityMode && !compatible.includes(chosenSelection.printerId || printerId)) {
        for (const key of Object.keys(chosenSelection)) delete chosenSelection[key];
        chosenSelection.printerId = compatible[0];
      } else if (!chosenSelection.printerId && printerId) chosenSelection.printerId = printerId;
      const changed = options.changedSetting || nozzleEdit;
      const change = changed && Object.hasOwn(settings,changed.key) ? { key: changed.key, ...(changed.index === undefined ? {} : { index: changed.index }), ...(changed.previousValue === undefined ? {} : { previousValue: changed.previousValue }) } : undefined;
      const request = { name: chosenName, type: scope, settings, ...(asNew || !loaded.custom ? { baseId: loaded.id } : {}), ...(scope === 'machine' ? {} : loaded.nativeCompatibilityMode ? {nativeCompatibility} : { compatiblePrinterIds: compatible }), selection: chosenSelection, mode,
        ...(loaded.nativeEditor ? {nativeEditor:true,filamentIndex:loaded.editorContext.filamentIndex,projectSettings:loaded.editorContext.projectSettings} : projectSettings || nativeContext.projectSettings ? { projectSettings: projectSettings || nativeContext.projectSettings } : {}),
        ...(previous ? { correctionBatches: previous.request.correctionBatches, acknowledgedWarnings: previous.request.acknowledgedWarnings, ...(previous.request.changedSetting ? { changedSetting: previous.request.changedSetting } : {}) } : change ? { changedSetting: change } : {}) };
      prepareFlow({ asNew, purpose: options.purpose || 'save', request });
    } catch (cause) { setError(cause.message); }
  }
  function acceptReview() {
    const decisions = review.groups.map(group => ({ id: group.id, signature: group.signature, choice: group.choice }));
    const request = { ...review.request,
      correctionBatches: [...(review.request.correctionBatches || []), ...(decisions.length ? [decisions] : [])],
      acknowledgedWarnings: [...new Set([...(review.request.acknowledgedWarnings || []), ...review.notices.map(warningKey)])] };
    prepareFlow({ asNew: review.asNew, purpose: review.purpose, request });
  }
  async function importPreset(file) {
    if (!file) return;
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller; setPending(true); setError('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Preset JSON must be smaller than 2 MB');
      const preset = JSON.parse(await file.text());
      if (controller.signal.aborted) return;
      if (preset.type !== scope) throw new Error(`Open the ${titles[preset.type] || preset.type || 'matching'} preset editor to import this preset`);
      await mutate('/api/presets/custom/import', 'POST', { preset });
    } catch (cause) { if (!controller.signal.aborted) setError(cause.message); }
    finally { if (operation.current === controller) { setPending(false); operation.current = null; } }
  }
  async function exportPreset() {
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller; setPending(true); setError('');
    try {
      const response = await fetch(`${sourceUrl(scope, loaded.id)}/export`, { signal: controller.signal });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Preset export failed'); }
      const blob = await response.blob(); if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${loaded.name.replace(/[^\w .-]/g, '_')}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { if (!controller.signal.aborted) setError(cause.message); }
    finally { if (operation.current === controller) { setPending(false); operation.current = null; } }
  }
  const close = () => { if (!mutating) { operation.current?.abort(); setPending(false); onClose(); } };
  const saveDisabled = pending || Boolean(review) || !loaded || !name.trim() || Object.keys(fieldErrors).length > 0;
  return <dialog ref={dialog} className="profile-editor" aria-labelledby="profile-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="profile-editor-title">{titles[scope] || 'Native'} preset editor</h2><p>{loaded?.name || (pending ? 'Loading native preset…' : 'Select a preset')}</p></div><button type="button" onClick={close} disabled={mutating} aria-label="Close preset editor">×</button></header>
    <div className="profile-management">
      <label>Preset name<input aria-label="Preset name" value={name} onChange={event => setName(event.target.value)} disabled={pending || Boolean(review) || !loaded}/></label>
      <div><button type="button" disabled={pending || Boolean(review) || !loaded} onClick={exportPreset}>Export saved preset</button><button type="button" disabled={pending || Boolean(review) || !loaded} onClick={() => fileInput.current?.click()}>Import native preset</button>
        <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Import native preset JSON" hidden disabled={pending || Boolean(review) || !loaded} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; importPreset(file); }}/>
        {loaded?.custom && <button type="button" disabled={pending || Boolean(review)} onClick={() => setConfirmDelete(true)}>Delete preset</button>}
      </div>
      {scope !== 'machine' && !loaded?.nativeCompatibilityMode && <details><summary>Compatible printers ({compatible.length})</summary><select multiple aria-label="Compatible printers" value={compatible} disabled={pending || Boolean(review) || !loaded} onChange={event => setCompatible(Array.from(event.target.selectedOptions, option => option.value))}>{compatible.filter(id => !printers.some(item => item.id === id)).map(id => <option key={id} value={id}>{id} (unavailable)</option>)}{printers.map(printer => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select></details>}
    </div>
    {loaded?.nativeInheritanceMode && <p role="status">{loaded.nativeParent ? `Native parent: ${loaded.nativeParent}. Use source value resets to that parent's setting; export preserves native differences.` : 'Native root preset. Export includes its complete saved settings.'}</p>}
    {loaded?.nativeCompatibilityMode && scope==='filament' && <PresetDependencies value={nativeCompatibility} options={loaded.compatibilityOptions} disabled={pending||Boolean(review)} onChange={value=>{setNativeCompatibility(value);setReview(null);setAcceptedFlow(null);}}/>}
    {loaded?.nativeCompatibilityMode && scope==='process' && <details><summary>Native JSON dependencies</summary><p>These process dependencies are preserved from the native preset JSON.</p><pre>{JSON.stringify(nativeCompatibility,null,2)}</pre></details>}
    {loaded?.compatibilityResults?.some(item=>!item.compatible) && <p role="status">This preset is incompatible with the current printer or process. You can edit its settings and dependencies; slicing requires a compatible selection.</p>}
    {loaded?.nativeEditor && <section className="profile-variant-context" aria-label="Native preset variant context"><p>{scope==='filament'?`Editing material slot ${loaded.editorContext.filamentIndex+1}. `:''}Stored values for the selected nozzle variants; other variants remain in the saved preset.</p><div>{loaded.editorContext.nozzles.map(nozzle=><label key={nozzle.physicalNozzle}>Nozzle {nozzle.physicalNozzle} · {nozzle.extruderType}<select aria-label={`Edit nozzle ${nozzle.physicalNozzle} volume variant`} value={nozzle.nozzleVolume} disabled={pending||Boolean(review)||dirty||nozzle.volumeOptions.length<2} onChange={event=>{const volumes=[...loaded.editorContext.nozzleVolumeTypes];volumes[nozzle.physicalNozzle-1]=event.target.value;setVariantChoice({key:contextKey,settings:{...loaded.editorContext.projectSettings,nozzle_volume_type:volumes}});}}>{nozzle.volumeOptions.map(volume=><option key={volume}>{volume}</option>)}</select></label>)}</div>{dirty&&<small>Save or reset edits before switching variants.</small>}{loaded.editorContext.slicingDifferences?.length>0&&<p role="status">OrcaSlicer 2.4.2 resolves some slicing motion limits differently from the stored editor values: {loaded.editorContext.slicingDifferences.join(', ')}.</p>}</section>}
    {confirmDelete && <section className="profile-delete" role="alertdialog" aria-label="Delete custom preset"><p>Delete “{loaded?.name}”? Projects that use it will need another preset.</p><button type="button" onClick={() => setConfirmDelete(false)} disabled={pending}>Keep preset</button><button type="button" disabled={pending} onClick={() => mutate(`/api/presets/custom/${encodeURIComponent(loaded.id)}`, 'DELETE', undefined, { deleted: true })}>Confirm delete</button></section>}
    {review && <section className="profile-corrections" role="alertdialog" aria-label="Review native setting corrections" aria-modal="true">
      <h3>Review native setting corrections</h3><p>OrcaSlicer requires these choices before saving this preset.</p>
      {review.groups.map(group => <fieldset key={group.id}><legend>{group.reason}</legend>
        <ul>{group.changes.map(change => <li key={change.key}>{settingLabel(definitions.find(item => item.key === change.key) || { key: change.key })}: <code>{JSON.stringify(change.value)}</code></li>)}</ul>
        {group.alternative && <div><label><input type="radio" name={`correction-${group.id}`} checked={group.choice === 'apply'} onChange={() => setReview(current => ({ ...current, groups: current.groups.map(item => item.id === group.id ? { ...item, choice: 'apply' } : item) }))}/>{group.applyLabel || 'Apply these corrections'}</label>
          <label><input type="radio" name={`correction-${group.id}`} checked={group.choice === 'alternative'} onChange={() => setReview(current => ({ ...current, groups: current.groups.map(item => item.id === group.id ? { ...item, choice: 'alternative' } : item) }))}/>{group.alternativeLabel || `Instead set ${group.alternative.key} to ${JSON.stringify(group.alternative.value)}`}</label></div>}
      </fieldset>)}
      {review.notices.map(item => <p key={warningKey(item)}>{item.message}</p>)}
      <button type="button" disabled={pending} onClick={() => setReview(null)}>Keep editing</button><button type="button" disabled={pending} className="profile-primary" onClick={acceptReview}>{review.purpose === 'edit' ? 'Apply choices' : 'Apply choices and save'}</button>
    </section>}
    {error && <p role="alert" className="profile-error">{error}</p>}
    <div className="profile-navigation"><input aria-label="Search profile settings" placeholder="Search settings" value={search} onChange={event => setSearch(event.target.value)}/><select aria-label="Profile settings mode" value={mode} onChange={event => setMode(event.target.value)}>{['Simple','Advanced','Expert'].map(item => <option key={item}>{item}</option>)}</select><select aria-label="Profile settings category" disabled={Boolean(search)} value={currentPage || ''} onChange={event => setPage(event.target.value)}>{pages.map(item => <option key={item}>{item}</option>)}</select></div>
    <div className="profile-settings-list">{loaded && rows.map((definition, index) => <React.Fragment key={definition.key}>
      {(index === 0 || rows[index - 1].ui.group !== definition.ui.group || rows[index - 1].ui.page !== definition.ui.page) && <h3>{search && `${definition.ui.page} · `}{definition.ui.group}</h3>}
      <div className={`profile-setting ${!same(draft[definition.key], loaded.settings[definition.key]) ? 'modified' : ''}`} data-profile-setting={definition.key}>
        <div className="profile-setting-label"><strong title={definition.tooltip}>{settingLabel(definition)}</strong><small>{definition.key}</small>{loaded.baseSettings&&Object.hasOwn(loaded.overrides||{},definition.key)&&!same(draft[definition.key],loaded.baseSettings[definition.key])&&<button type="button" aria-label={`Reset ${settingLabel(definition)} (${definition.key}) to source`} disabled={pending||Boolean(review)} onClick={()=>changeSetting(definition,clone(loaded.baseSettings[definition.key]))}>Use source value</button>}{!same(draft[definition.key], loaded.settings[definition.key]) && <button type="button" aria-label={`Reset ${settingLabel(definition)} (${definition.key})`} disabled={pending || Boolean(review)} onClick={() => changeSetting(definition, clone(loaded.settings[definition.key]))}>Reset</button>}</div>
        <ProfileSettingInput variantField={loaded.variantFields?.[definition.key]} definition={{ ...definition, ...(dependencies.fields[scope][definition.key]?.options ? { options: dependencies.fields[scope][definition.key].options } : {}) }} dependency={dependencies.fields[scope][definition.key]} value={draft[definition.key]} disabled={pending || Boolean(review) || draft[definition.key] === undefined || unavailable(definition.key)} change={value => changeSetting(definition, value)}/>
        {unavailable(definition.key) && <small className="profile-note">{definition.key === 'post_process' ? 'Host scripts are disabled on this server.' : definition.key.startsWith('bed_custom') ? 'External bed model/texture paths are not editable in the browser.' : 'Edit printer connections in Device.'}</small>}
        {dependencies.fields[scope][definition.key]?.reasons?.length > 0 && <small className="profile-note">{dependencies.fields[scope][definition.key].reasons.join(' ')}</small>}
        {fieldErrors[definition.key] && <p role="alert" className="profile-field-error">{fieldErrors[definition.key]}</p>}
      </div></React.Fragment>)}{loaded && !rows.length && <p>No settings match this search and visibility mode.</p>}</div>
    <footer><small>{rows.length} shown · {definitions.length} editable definitions · OrcaSlicer 2.4.2{dirty ? ' · Unsaved edits' : ''}</small><button type="button" disabled={pending || !loaded || !dirty} onClick={() => { acceptLoaded(loaded, false); setError(''); }}>Reset edits</button><button type="button" disabled={mutating} onClick={close}>Close</button>{loaded?.custom && <button type="button" disabled={saveDisabled} onClick={() => save(true)}>Save as new</button>}<button type="button" className="profile-primary" disabled={saveDisabled} onClick={() => save(false)}>{pending ? 'Working…' : loaded?.custom ? 'Save changes' : 'Save as new preset'}</button></footer>
  </dialog>;
}
