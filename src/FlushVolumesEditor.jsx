import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { filamentSlotCount, filamentColors } from '../shared/filament-slots.js';
import { normalizeNativeProjectValues } from '../shared/profile-settings.js';
import { normalizePurgeSettings, physicalNozzleCount, purgeDisplayValue, purgeRawValue, PURGE_LIMITS } from '../shared/purge-volumes.js';
export default function FlushVolumesEditor({ project, printerSettings, onChange, onClose }) {
  const count = filamentSlotCount(project), colors = filamentColors(project);
  const source = project.useEmbeddedSettings ? project.nativeSettings : project.projectOverrides || {};
  const nozzles = physicalNozzleCount(project.useEmbeddedSettings ? source : printerSettings || {});
  const [initial] = useState(() => { try { return { values: normalizePurgeSettings(source, count, {nozzles}) }; } catch (cause) { return {error: cause.message}; } });
  const [values, setValues] = useState(initial.values);
  const [nozzle, setNozzle] = useState(0), [error, setError] = useState(initial.error || '');
  const multiplier = values?.flush_multiplier[nozzle];
  const offset = nozzle * count * count;
  function editCell(row, column, display) {
    try {
      const raw = purgeRawValue(Math.min(PURGE_LIMITS.displayVolume, Math.max(0, parseInt(display, 10) || 0)), multiplier);
      setValues(current => ({...current, flush_volumes_matrix: current.flush_volumes_matrix.map((value,index) => index === offset + row*count + column ? raw : value)}));
      setError('');
    } catch (cause) { setError(cause.message); }
  }
  function apply() {
    try {
      const normalized = normalizePurgeSettings(values, count, {nozzles});
      onChange(normalizeNativeProjectValues(normalized)); onClose();
    } catch (cause) { setError(cause.message); }
  }
  return <Modal aria-label="Flushing volumes" className="flush-volumes-editor" onClose={onClose}>
    <h2>Flushing volumes</h2><p>Volume in mm³ when changing from the row filament to the column filament. Displayed volumes include the selected nozzle’s multiplier.</p>
    {values && <>
      {nozzles > 1 && <label>Physical nozzle<select aria-label="Purging physical nozzle" value={nozzle} onChange={event=>setNozzle(Number(event.target.value))}>{Array.from({length:nozzles},(_,index)=><option key={index} value={index}>{nozzles===2?(index===0?'Left nozzle':'Right nozzle'):`Nozzle ${index+1}`}</option>)}</select></label>}
      <label>Flush multiplier<input aria-label="Flush multiplier" type="number" min="0" max="3" step="0.1" value={multiplier} onChange={event=>{const next=String(Math.max(0,Math.min(3,Number(event.target.value)||0)));setValues(current=>({...current,flush_multiplier:current.flush_multiplier.map((value,index)=>index===nozzle?next:value)}));setError('');}}/></label>
      <div className="flush-table"><table><thead><tr><th>From ↓ / To →</th>{colors.map((color,i)=><th key={i}><i style={{background:color}}/>{i+1}</th>)}</tr></thead><tbody>{colors.map((color,row)=><tr key={row}><th><i style={{background:color}}/>{row+1}</th>{colors.map((_,column)=><td key={column}><input aria-label={`Flush from filament ${row+1} to ${column+1}`} type="number" min="0" max={PURGE_LIMITS.displayVolume} step="1" disabled={row===column} value={purgeDisplayValue(values.flush_volumes_matrix[offset+row*count+column],multiplier)} onChange={event=>editCell(row,column,event.target.value)}/></td>)}</tr>)}</tbody></table></div>
      <p>The reset uses a base volume of 280 mm³ for this table. It does not calculate volumes from filament colors.</p>
    </>}
    {error&&<p role="alert">{error}</p>}<footer><button disabled={!values} onClick={()=>setValues(current=>({...current,flush_volumes_matrix:current.flush_volumes_matrix.map((value,index)=>index>=offset&&index<offset+count*count?String(Math.floor((index-offset)/count)===(index-offset)%count?0:280):value)}))}>Reset to 280 mm³</button><button onClick={onClose}>Cancel changes</button><button disabled={!values} onClick={apply}>Apply flushing volumes</button></footer>
  </Modal>;
}
