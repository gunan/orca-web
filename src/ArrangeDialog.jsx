import React,{useState} from 'react';
import Modal from './Modal.jsx';
import {ARRANGE_DEFAULTS,normalizeArrangeOptions} from '../shared/native-arrangement.js';
export default function ArrangeDialog({options,onApply,onClose,selected=false}){
 const[draft,setDraft]=useState(options),[error,setError]=useState('');
 return <Modal aria-label="Arrange options" onClose={onClose}><header><h2>Arrange options</h2><button aria-label="Close arrange options" onClick={onClose}>×</button></header><form onSubmit={event=>{event.preventDefault();try{onApply(normalizeArrangeOptions(draft));}catch(problem){setError(problem.message);}}}>
 <label>Spacing (mm)<input aria-label="Arrangement spacing" type="number" min="0" max="100" step="0.05" value={draft.spacing} onChange={event=>setDraft({...draft,spacing:event.target.value===''?'':Number(event.target.value)})}/></label><p>0 means auto spacing.</p>
 <label><input type="checkbox" checked={draft.rotation} onChange={event=>setDraft({...draft,rotation:event.target.checked,alignY:event.target.checked?false:draft.alignY})}/>Auto rotate for arrangement</label>
 <label><input type="checkbox" checked={draft.multipleMaterials} onChange={event=>setDraft({...draft,multipleMaterials:event.target.checked})}/>Allow multiple materials on same plate</label>
 <label><input type="checkbox" disabled={draft.rotation} checked={draft.alignY} onChange={event=>setDraft({...draft,alignY:event.target.checked})}/>Align to Y axis</label>
 <label>Arrange<input type="radio" name="arrangeScope" checked={draft.scope==='plate'} onChange={()=>setDraft({...draft,scope:'plate'})}/>Current plate</label>
 <label><input type="radio" name="arrangeScope" disabled={!selected} checked={draft.scope==='selection'} onChange={()=>setDraft({...draft,scope:'selection'})}/>Selected objects</label>
 {error&&<p role="alert">{error}</p>}<footer><button type="button" onClick={()=>setDraft({...ARRANGE_DEFAULTS})}>Reset</button><button type="button" onClick={onClose}>Cancel</button><button type="submit">Arrange</button></footer></form></Modal>;
}
