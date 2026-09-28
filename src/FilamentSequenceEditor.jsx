import React,{useState} from 'react';
import Modal from './Modal.jsx';
import {platePrintSequence,updatePlatePrintSequence} from '../shared/filament-sequence.js';
export default function FilamentSequenceEditor({plate,settings={},filamentCount=1,onChange,onClose}){
  const initial=()=>{try{return{value:platePrintSequence(plate,settings,filamentCount),error:''};}catch(cause){return{value:{firstLayer:null,ranges:[]},error:cause.message};}};
  const [state,setState]=useState(initial),[draft,setDraft]=useState({start:2,end:100,order:Array.from({length:filamentCount},(_,i)=>i+1).join(' ')}),[editing,setEditing]=useState(null);
  const [firstDraft,setFirstDraft]=useState(()=>state.value.firstLayer?.join(' ')||Array.from({length:filamentCount},(_,i)=>i+1).join(' '));
  const defaultOrder=Array.from({length:filamentCount},(_,i)=>i+1),parse=text=>String(text).trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const update=change=>setState(current=>({value:{...current.value,...change},error:''}));
  function add(event){event.preventDefault();try{
    const next={...state.value,firstLayer:state.value.firstLayer===null?null:parse(firstDraft),ranges:state.value.ranges.filter((_,i)=>i!==editing)};next.ranges.push({start:Number(draft.start),end:Number(draft.end),order:parse(draft.order)});
    updatePlatePrintSequence(plate,next,filamentCount);setState({value:next,error:''});setEditing(null);
  }catch(cause){setState(current=>({...current,error:cause.message}));}}
  return <Modal className="layer-events-editor" aria-label="Filament printing order" onClose={onClose}>
    <h2>Filament printing order · {plate.name}</h2>
    <p>Set the order for the first layer and selected layer ranges. Unused filaments are ignored. Later rows take priority where ranges overlap.</p>
    <label>First layer<select aria-label="First layer ordering" value={state.value.firstLayer===null?'auto':'custom'} onChange={event=>{update({firstLayer:event.target.value==='auto'?null:defaultOrder});setFirstDraft(defaultOrder.join(' '));}}><option value="auto">Automatic</option><option value="custom">Custom</option></select></label>
    {state.value.firstLayer!==null&&<label>Filament slots in order<input aria-label="First layer filament order" value={firstDraft} onChange={event=>setFirstDraft(event.target.value)}/></label>}
    <ol className="layer-event-list">{state.value.ranges.map((range,index)=><li key={index}><span>Layers {range.start}–{range.end}: {range.order.join(' → ')}</span><button aria-label={`Edit order range ${index+1}`} onClick={()=>{setDraft({...range,order:range.order.join(' ')});setEditing(index);}}>Edit</button><button aria-label={`Delete order range ${index+1}`} onClick={()=>{update({ranges:state.value.ranges.filter((_,i)=>i!==index)});setEditing(null);}}>Delete</button></li>)}</ol>
    <form onSubmit={add}><h3>{editing===null?'Add layer range':'Edit layer range'}</h3><div className="layer-event-fields"><label>First layer<input required type="number" min="2" max="1000000" aria-label="Order range start" value={draft.start} onChange={event=>setDraft(current=>({...current,start:event.target.value}))}/></label><label>Last layer<input required type="number" min="2" max="1000000" aria-label="Order range end" value={draft.end} onChange={event=>setDraft(current=>({...current,end:event.target.value}))}/></label><label>Filament slots<input required aria-label="Range filament order" value={draft.order} onChange={event=>setDraft(current=>({...current,order:event.target.value}))}/></label></div><p>Enter slot numbers separated by spaces. Every range must list the same number of slots.</p><button type="submit">{editing===null?'Add order range':'Update order range'}</button></form>
    {plate.native?.filamentSequence&&<p>The imported slice records {plate.native.filamentSequence.sequence.length} filament changes. Applying an order clears that old result; slice again to calculate it.</p>}
    {state.error&&<p role="alert">{state.error}</p>}
    <footer><button onClick={()=>update({firstLayer:null,ranges:[]})}>Reset to automatic</button><button onClick={onClose}>Cancel changes</button><button onClick={()=>{try{onChange(updatePlatePrintSequence(plate,{...state.value,firstLayer:state.value.firstLayer===null?null:parse(firstDraft)},filamentCount));onClose();}catch(cause){setState(current=>({...current,error:cause.message}));}}}>Apply filament order</button></footer>
  </Modal>;
}
