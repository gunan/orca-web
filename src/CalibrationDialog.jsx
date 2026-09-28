import React, { useEffect, useRef, useState } from 'react';
import { CALIBRATION_MODES } from '../shared/calibration.js';
import { INPUT_SHAPER_TYPES } from '../shared/input-shaping-calibration.js';
import { corneringDefaults } from '../shared/cornering-calibration.js';
import { FLOW_RATIO_METHODS } from '../shared/flow-ratio-calibration.js';
import { MEASURED_CALIBRATION_MODES } from '../shared/calibration-results.js';
import './calibration.css';

export default function CalibrationDialog({ open, onClose, onCreate, selection, printerConfig }) {
  const dialog = useRef(null), request = useRef(null);
  const [mode, setMode] = useState('temperature');
  const [values, setValues] = useState({ ...CALIBRATION_MODES[0].defaults });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const definition = CALIBRATION_MODES.find(item => item.id === mode);
  const flowRatio = mode === 'flow-ratio', cornering = mode === 'cornering', shaping = mode.startsWith('input-shaping-'), frequencyTest = mode === 'input-shaping-frequency';
  const flavor = Array.isArray(printerConfig?.gcode_flavor) ? printerConfig.gcode_flavor[0] : printerConfig?.gcode_flavor;
  const sharedAxes = flavor === 'reprapfirmware';
  const shaperTypes = INPUT_SHAPER_TYPES[flavor] || [];
  const firmwareUnsupported = shaping && flavor && !shaperTypes.length;
  const corneringUnit = flavor === 'marlin2' && Number(Array.isArray(printerConfig?.machine_max_junction_deviation) ? printerConfig.machine_max_junction_deviation[0] : printerConfig?.machine_max_junction_deviation) > 0 ? 'mm junction deviation' : 'mm/s jerk';
  const numericFields = flowRatio ? [] : cornering ? [['start', `Start (${corneringUnit})`], ['end', `End (${corneringUnit})`]] : !shaping ? [['start', 'Start'], ['end', 'End'], ['step', 'Step']] : frequencyTest
    ? [['frequencyStartX', 'Frequency X start (Hz)'], ['frequencyEndX', 'Frequency X end (Hz)'], ...(!sharedAxes ? [['frequencyStartY', 'Frequency Y start (Hz)'], ['frequencyEndY', 'Frequency Y end (Hz)']] : []), ['damping', 'Damping']]
    : [['frequencyX', 'Frequency X (Hz)'], ...(!sharedAxes ? [['frequencyY', 'Frequency Y (Hz)']] : []), ['start', 'Damping start'], ['end', 'Damping end']];
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
    if (!open) { request.current?.abort(); setBusy(false); }
  }, [open]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { request.current?.abort(); setBusy(false); setValues(current => current.shaperType ? { ...current, shaperType: 'auto' } : current); }, [selection?.printerId, selection?.processId, selection?.filamentId]);
  const close = () => { request.current?.abort(); onClose(); };
  async function generate(event) {
    event.preventDefault();
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/calibrations/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal, body: JSON.stringify({ ...selection, mode, ...values, ...(mode==='pressure-advance-pattern'?Object.fromEntries(['speeds','accelerations'].map(key=>[key,Array.isArray(values[key])?values[key]:values[key].split(',').map(value=>value.trim()).filter(Boolean)])):{}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not prepare calibration');
      if (controller.signal.aborted) return;
      await onCreate(result);
      onClose();
    } catch (cause) { if (!controller.signal.aborted) setError(cause.message); }
    finally { if (request.current === controller) { setBusy(false); request.current = null; } }
  }
  return <dialog ref={dialog} className="calibration-dialog" aria-labelledby="calibration-title" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={generate}>
      <header><h2 id="calibration-title">Calibration</h2><button type="button" onClick={close} aria-label="Close calibration">×</button></header>
      <p>Prepare a native calibration model and a layer schedule for the selected printer, process and filament.</p>
      <label>Calibration test<select aria-label="Calibration test" value={mode} disabled={busy} onChange={event => { const next = CALIBRATION_MODES.find(item => item.id === event.target.value); setMode(next.id); setValues(next.id === 'cornering' ? corneringDefaults(printerConfig) : { ...next.defaults }); setError(''); }}>
        {CALIBRATION_MODES.map(item => <option key={item.id} value={item.id}>{item.label}{item.supported ? '' : ' — not implemented'}</option>)}
      </select></label>
      {definition.supported ? <>
        <div className="calibration-fields">
          {flowRatio && <>
            <label>Flow test method<select aria-label="Calibration flow method" disabled={busy} value={values.method} onChange={event => setValues(current => ({...current,method:event.target.value}))}>{Object.entries(FLOW_RATIO_METHODS).map(([id,item])=><option key={id} value={id}>{item.label}</option>)}</select></label>
            <label>Top surface pattern<select aria-label="Calibration top pattern" disabled={busy} value={values.pattern} onChange={event => setValues(current => ({...current,pattern:event.target.value}))}><option value="archimedeanchords">Archimedean Chords</option><option value="monotonic">Monotonic</option></select></label>
          </>}
          {mode==='pressure-advance-pattern' && <>{[['speeds','Speeds (mm/s)'],['accelerations','Accelerations (mm/s²)']].map(([key,label])=><label key={key}>{label}<input aria-label={`Calibration ${key}`} type="text" disabled={busy} placeholder="Use native preset default" value={Array.isArray(values[key])?values[key].join(', '):values[key]} onChange={event=>setValues(current=>({...current,[key]:event.target.value}))}/></label>)}</>}
          {mode==='pressure-advance-line' && <label><input aria-label="Print PA numbers" type="checkbox" checked={values.printNumbers} disabled={busy} onChange={event=>setValues(current=>({...current,printNumbers:event.target.checked}))}/>Print numbers</label>}
          {(shaping || cornering) && <>
            <label>Test model<select aria-label="Calibration test model" disabled={busy} value={values.testModel} onChange={event => setValues(current => ({ ...current, testModel: event.target.value }))}><option value="ringing">Ringing tower</option><option value="fast">Fast tower</option>{cornering && <option value="scv">SCV-V2 tower</option>}</select></label>
            {shaping && <label>Input shaper type<select aria-label="Calibration shaper type" disabled={busy} value={values.shaperType} onChange={event => setValues(current => ({ ...current, shaperType: event.target.value }))}><option value="auto">Native default{shaperTypes[0] ? ` (${shaperTypes[0]})` : ''}</option>{shaperTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>}
          </>}
          {numericFields.map(([key, label]) => <label key={key}>{label}{definition.unit ? ` (${definition.unit})` : ''}<input type="number" required aria-label={`Calibration ${key}`} step={mode === 'temperature' ? 5 : 'any'} value={values[key]} disabled={busy || (mode === 'temperature' && key === 'step')} onChange={event => setValues(current => ({ ...current, [key]: event.target.value, ...(sharedAxes && key.includes('X') ? { [key.replace('X', 'Y')]: event.target.value } : {}) }))}/></label>)}
        </div>
        {mode === 'pressure-advance-pattern' ? <><p>Generates four layers of native chevrons, an anchoring frame, PA/flow/acceleration labels and a 5 mm handle cube for each speed × acceleration combination. Preview shows the generated paths around the handles.</p><p>Enter up to four comma-separated speeds and accelerations, or leave either blank to use its native preset calculation. Complete patterns are placed on additional rectangular plates when needed. Select a plate to slice or export it; Export native project preserves the whole batch. Geometry and layer commands remain bound to the original presets.</p></> : mode === 'pressure-advance-line' ? <><p>Generates native slow–fast–slow pressure-advance lines and optional numbered tabs. The bed height limits the number of lines. Prepare shows the native preview asset; Preview shows actual generated paths.</p><p>Requires one rectangular bed and explicit extrusion retraction. Unsupported custom template expressions fail clearly. Timing and material estimates from the preview asset are removed. Native GUI export equivalence is unverified.</p></> : mode === 'retraction' ? <><p>Actual retraction and wipe extrusion change after each native layer switch, followed by a matching unretraction. The native tower uses two walls and a one-millimetre height schedule after its base.</p><p>Currently requires layer-cooling slowdown, adaptive PA and pressure equalizer disabled, and zero extra restart length. A zero-length range also requires zero Z hop. Incompatible presets fail clearly during generation. Printing-time estimates are unavailable; no best length is inferred.</p></> : mode === 'max-volumetric-speed' ? <><p>Requested flow increases with height in the native structure. Line width is 1.75× nozzle diameter and layer height is 0.8× nozzle diameter. The native workflow raises the filament allowance to 200 mm³/s.</p><p>First-layer speed, slowdown and whole-mm/s rounding affect actual flow. Printing-time estimates are unavailable after the schedule; material estimates remain available. Measure the failure height on a printed test before choosing a limit.</p></> : mode === 'vfa' ? <><p>Requested outer-wall speed changes every 5 mm of the native spiral tower. OrcaSlicer still controls first-layer speed, the slowdown ramp and filament flow limits, so actual speed can be lower.</p><p>Printing-time estimates are unavailable after the speed schedule; material estimates remain available. Evaluate the printed surface before choosing a speed.</p></> : flowRatio ? <><p>Generates the labelled native specimens as separate 3MF objects with different extrusion ratios. The test uses ten layers scaled to the selected nozzle. The specimen layout must fit the current bed.</p><p>After inspecting the printed specimens, choose the best label with Save calibration result to create a new filament preset. YOLO adds the label value to the current flow ratio; coarse/fine passes apply the label as a percentage.</p></> : cornering ? <><p>Cornering varies {corneringUnit} continuously across the native tower. Ringing and fast towers are 60 mm tall; SCV-V2 is 100 mm. The selected printer preset determines junction deviation versus classic jerk.</p><p>Native calibration uses 2,000 mm/s² acceleration and disables cooling slowdown. Printing-time estimates are unavailable after the varying cornering schedule; material estimates remain available. Evaluate the printed result before choosing a measured setting.</p></> : shaping ? <><p>The native 60 mm tower uses a continuous spiral wall. {frequencyTest ? 'Frequency changes over the sliced layers while damping stays fixed.' : 'Damping changes over the sliced layers using previously measured frequencies.'} Zero frequency or damping retains the firmware value. {sharedAxes && 'RepRapFirmware uses the X frequency settings for both axes.'}</p><p>Requires compatible firmware: Marlin 2.1.2+, Klipper 0.9.0+, or RepRapFirmware 3.4.0+. Shaper choices depend on firmware. Vibration measurement and applying measured results are not implemented.</p></> : <p>{mode === 'temperature' ? 'Temperature decreases in 5 °C steps across the native labelled blocks. The model scales with nozzle diameter.' : 'PA changes by the selected step per millimetre of height. This uses the native seam tower; Automatic PA calibration is not implemented.'}</p>}
        <p>Generation replaces the current scene with {flowRatio ? 'the native flow specimens' : mode==='pressure-advance-pattern' ? 'the generated pattern handles and four layer command sets' : 'one calibration object'}. Geometry and presets must remain unchanged until slicing. {flowRatio || MEASURED_CALIBRATION_MODES.includes(mode) ? 'After inspecting the print, use Save calibration result to create a new filament preset. The application does not print or measure the test.' : 'Result measurement and saving calibrated native presets are not implemented.'}</p>
      </> : <p role="status">This calibration workflow is not implemented. No ordinary model will be presented as a working calibration.</p>}
      {firmwareUnsupported && <p role="alert">Input shaping requires Klipper, RepRapFirmware or Marlin 2. Select a compatible printer preset.</p>}
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={busy || !definition.supported || firmwareUnsupported || !selection?.printerId || !selection?.processId || !selection?.filamentId}>{busy ? 'Preparing native model…' : 'Generate calibration'}</button></footer>
    </form>
  </dialog>;
}
