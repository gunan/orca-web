import React, { useEffect, useRef, useState } from 'react';
import {calibrationResultDefinition,measuredCalibrationResult} from '../shared/calibration-results.js';
import './calibration.css';

/** Measurements are entered explicitly. Only the server's cached calibration
 * plan determines which original filament/template and native keys are saved. */
export default function CalibrationResultDialog({ open, onClose, calibration, plan, onSaved }) {
  const dialog = useRef(null), operation = useRef(null);
  const [objectId,setObjectId] = useState(''), [value,setValue] = useState(''), [name,setName] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const flow=plan?.request?.mode==='flow-ratio',specimens=flow?plan.specimens||[]:[],selected=specimens.find(item=>item.objectId===objectId);
  let definition=null,measured=null;try{definition=calibrationResultDefinition(plan);if(value!=='')measured=measuredCalibrationResult(plan,value);}catch{/* Unsupported ranges and empty/invalid measurements cannot be saved. */}
  const ready=flow?Boolean(selected):Boolean(measured);
  useEffect(() => { if(open&&!dialog.current?.open)dialog.current?.showModal();if(!open&&dialog.current?.open)dialog.current.close(); }, [open]);
  useEffect(() => { setObjectId('');setValue('');setName(`${plan?.context?.filament || 'Filament'} — calibrated ${flow?'flow':definition?.label.toLowerCase()||'result'}`.slice(0,100));setError(''); }, [calibration?.token]);
  useEffect(() => () => operation.current?.abort(), []);
  const close = () => { if(!busy)onClose(); };
  async function save(event) {
    event.preventDefault();if(!ready)return;
    const controller = new AbortController();operation.current = controller;setBusy(true);setError('');
    try {
      const response = await fetch('/api/calibrations/result',{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({token:calibration.token,...(flow?{objectId:selected.objectId}:{value:measured.result.value}),name:name.trim()})});
      const result = await response.json();if(!response.ok)throw new Error(result.error||'Could not save calibrated filament');
      if(controller.signal.aborted)return;await onSaved(result);onClose();
    } catch(cause) { if(!controller.signal.aborted)setError(cause.message); }
    finally { if(operation.current===controller){operation.current=null;setBusy(false);} }
  }
  return <dialog ref={dialog} className="calibration-dialog" aria-labelledby="calibration-result-title" onCancel={event=>{event.preventDefault();close();}}>
    <form onSubmit={save}>
      <header><h2 id="calibration-result-title">{flow?'Save flow calibration result':'Save calibration result'}</h2><button type="button" aria-label="Close calibration result" disabled={busy} onClick={close}>×</button></header>
      {flow?<><p>Inspect the printed top surfaces and choose the best labelled specimen. The application does not measure or select a result automatically.</p>
      <label>Best specimen<select aria-label="Best flow specimen" required value={objectId} disabled={busy} onChange={event=>setObjectId(event.target.value)}><option value="">Select the measured specimen…</option>{specimens.map(item=><option key={item.objectId} value={item.objectId}>{item.name.replace('flowrate_','').replace(/^m/,'−')} → flow ratio {item.flowRatio}</option>)}</select></label></>:definition?<><p>Inspect the printed calibration and enter the value you measured or chose. The application does not infer a result from the G-code or a model preview.</p><label>{definition.label}{definition.unit?` (${definition.unit})`:''}<input aria-label="Measured calibration value" type="number" required min={definition.min} max={definition.max} step={definition.integer?'1':'any'} value={value} disabled={busy} onChange={event=>setValue(event.target.value)}/></label><p>Tested nominal range: {definition.min}–{definition.max} {definition.unit}. {definition.description}</p></>:<p role="alert">Saving a measured result is not implemented for this calibration mode.</p>}
      <label>New filament preset name<input aria-label="Calibrated filament name" required maxLength={100} value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
      {selected && <p role="status">Flow ratio: {plan.flow.baseFlow} → <strong>{selected.flowRatio}</strong>. {plan.flow.linear ? 'Current ratio plus the specimen label.' : 'Current ratio multiplied by one plus the label divided by 100.'}</p>}
      {measured&&<p role="status">{definition.label}: <strong>{measured.result.value} {definition.unit}</strong>. This value is supplied by you and has not been physically verified by the application.</p>}
      <p>Creates a new filament preset for {plan?.context?.printer || 'the selected printer'} using the original filament as its source. The server verifies the generated calibration session before saving.</p>
      {error&&<p role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="submit" disabled={busy||!ready||!name.trim()||!calibration?.token}>{busy?'Saving filament…':'Save calibrated filament'}</button></footer>
    </form>
  </dialog>;
}
