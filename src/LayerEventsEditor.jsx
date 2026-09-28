import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { normalizeNativeLayerEvents } from '../shared/native-project.js';

const labels = { PausePrint: 'Pause print', Custom: 'Custom G-code', Template: 'Template G-code', ToolChange: 'Change filament', ColorChange: 'Color marker', Unknown: 'Unknown native event' };
const fresh = () => ({ printZ: '1', type: 'PausePrint', extruder: 1, color: '#FF8000', extra: '' });
export default function LayerEventsEditor({ plate, maxHeight, filamentCount = 1, extruderCount = 1, onChange, onClose }) {
  const [events, setEvents] = useState(() => structuredClone(plate.layerEvents || { mode: filamentCount > 1 ? extruderCount > 1 ? 'MultiExtruder' : 'MultiAsSingle' : 'SingleExtruder', items: [] }));
  const [draft, setDraft] = useState(fresh), [editing, setEditing] = useState(null), [error, setError] = useState('');
  function add(event) {
    event.preventDefault(); setError('');
    try {
      const item = { ...draft, printZ: Number(draft.printZ), extruder: Number(draft.extruder) };
      if (!(item.printZ <= maxHeight)) throw new Error(`Event height must not exceed ${maxHeight} mm.`);
      if (['ToolChange','ColorChange'].includes(item.type) && item.extruder > filamentCount) throw new Error('Choose an available filament slot.');
      if (item.type === 'Custom' && !item.extra.trim()) throw new Error('Enter G-code for this event.');
      const items = events.items.filter((_, index) => index !== editing);
      if (items.some(existing => existing.printZ === item.printZ)) throw new Error('A layer event already exists at this height. Edit that event to replace it.');
      items.push(item); items.sort((a,b) => a.printZ - b.printZ);
      setEvents(normalizeNativeLayerEvents({ ...events, items })); setDraft(fresh()); setEditing(null);
    } catch (cause) { setError(cause.message); }
  }
  return <Modal className="layer-events-editor" aria-label="Layer events" onClose={onClose}>
    <h2>Layer events · {plate.name}</h2><p>Events run when slicing reaches the selected height. Slice the plate again after applying changes.</p>
    <label>Printing mode<select aria-label="Layer event printing mode" value={events.mode} onChange={event => setEvents(current => ({ ...current, mode: event.target.value }))}><option value="SingleExtruder">Single filament</option><option value="MultiAsSingle">Multiple filaments, one extruder</option><option value="MultiExtruder">Multiple extruders</option></select></label>
    <ol className="layer-event-list">{events.items.map((item,index)=><li key={index}><span>Z {item.printZ} mm · {labels[item.type]}{['ToolChange','ColorChange'].includes(item.type)?` · Slot ${item.extruder}`:''}</span><button aria-label={`Edit event at ${item.printZ} mm`} onClick={()=>{setDraft({...item,printZ:String(item.printZ)});setEditing(index);setError('');}}>Edit</button><button aria-label={`Delete event at ${item.printZ} mm`} onClick={()=>{setEvents(current=>({...current,items:current.items.filter((_,i)=>i!==index)}));setEditing(null);setDraft(fresh());}}>Delete</button></li>)}</ol>
    {!events.items.length&&<p>No layer events on this plate.</p>}
    <form onSubmit={add}><h3>{editing===null?'Add event':'Edit event'}</h3><div className="layer-event-fields"><label>Height (mm)<input aria-label="Layer event height" type="number" min="0.001" max={maxHeight} step="any" required value={draft.printZ} onChange={event=>setDraft(current=>({...current,printZ:event.target.value}))}/></label><label>Action<select aria-label="Layer event action" value={draft.type} onChange={event=>setDraft(current=>({...current,type:event.target.value,extra:''}))}>{Object.entries(labels).filter(([key])=>key!=='Unknown').map(([key,label])=><option key={key} value={key}>{label}</option>)}{draft.type==='Unknown'&&<option value="Unknown">Unknown native event</option>}</select></label>
      {['ToolChange','ColorChange'].includes(draft.type)&&<label>Filament slot<select aria-label="Layer event filament" value={draft.extruder} onChange={event=>setDraft(current=>({...current,extruder:Number(event.target.value)}))}>{Array.from({length:filamentCount},(_,i)=><option value={i+1} key={i}>{i+1}</option>)}</select></label>}
      {draft.type==='ColorChange'&&<label>Color<input aria-label="Layer event color" type="color" value={draft.color} onChange={event=>setDraft(current=>({...current,color:event.target.value}))}/></label>}
    </div>{['Custom','PausePrint'].includes(draft.type)&&<label>{draft.type==='Custom'?'G-code':'Pause message'}<textarea aria-label={draft.type==='Custom'?'Layer event G-code':'Layer pause message'} rows={3} maxLength={65536} value={draft.extra} onChange={event=>setDraft(current=>({...current,extra:event.target.value}))}/></label>}
    {draft.type==='Template'&&<p>Uses the selected printer's custom G-code template.</p>}{draft.type==='PausePrint'&&<p>Uses the selected printer's pause G-code.</p>}{draft.type==='ColorChange'&&<p>OrcaSlicer 2.4.2 preserves this color marker in the project but does not emit a color-change command from it.</p>}
    {error&&<p role="alert">{error}</p>}<button type="submit">{editing===null?'Add layer event':'Update layer event'}</button>{editing!==null&&<button type="button" onClick={()=>{setEditing(null);setDraft(fresh());setError('');}}>Cancel event edit</button>}</form>
    <footer><button onClick={onClose}>Cancel changes</button><button onClick={()=>{try{onChange(normalizeNativeLayerEvents(events));onClose();}catch(cause){setError(cause.message);}}}>Apply layer events</button></footer>
  </Modal>;
}
