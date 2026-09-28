import React,{useState} from 'react';
import Modal from './Modal.jsx';
import {primeTowerState,updatePrimeTower} from '../shared/prime-tower.js';
export default function PrimeTowerEditor({project,process,bed,onChange,onClose}) {
 const [draft,setDraft]=useState(()=>primeTowerState(project,process)),[error,setError]=useState('');
 const outside=Number(draft.x)<bed.min[0]||Number(draft.x)>bed.max[0]||Number(draft.y)<bed.min[1]||Number(draft.y)>bed.max[1];
 function apply(){try{if(draft.enabled&&outside)throw new Error('Prime tower origin is outside the active build plate.');onChange(updatePrimeTower(project,draft,process));onClose();}catch(cause){setError(cause.message);}}
 return <Modal aria-label="Prime tower placement" className="help-dialog" onClose={onClose}><h2>Prime tower placement</h2><p>Position applies to {project.plates.find(plate=>plate.id===project.activePlateId)?.name}. Enable, width and rotation apply to the process on every plate.</p>
 <label className="import-option"><input type="checkbox" aria-label="Enable prime tower" checked={draft.enabled} onChange={event=>setDraft(current=>({...current,enabled:event.target.checked}))}/>Enable prime tower</label>
 {[['x','Prime tower X','mm'],['y','Prime tower Y','mm'],['width','Prime tower width','mm'],['rotation','Prime tower rotation','°']].map(([key,label,unit])=><label className="import-option" key={key}>{label} ({unit})<input aria-label={label} type="number" step="any" min={key==='width'?2:undefined} value={draft[key]} onChange={event=>setDraft(current=>({...current,[key]:event.target.value}))}/></label>)}
 <p>Prepare shows the native estimated tower with filament-color bands. Slice to inspect the actual tower, ribs, brim and toolpaths in Preview. Other tower settings are in Multimaterial.</p>
 {outside&&<p role="status">The tower origin is outside the build plate.</p>}{error&&<p role="alert">{error}</p>}<div className="unsaved-buttons"><button onClick={onClose}>Cancel changes</button><button onClick={apply}>Apply prime tower</button></div></Modal>;
}
