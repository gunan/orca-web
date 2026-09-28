import React,{useState} from 'react';
import {nativeDependencySelection} from '../shared/preset-compatibility.js';
/** Orca Tab::compatible_widget_create/reload and on_presets_compatible.
 * Applying the choice list is separate from toggling All, so Cancel and opening
 * a list never destroy a stored name that is absent from this catalog. */
export default function PresetDependencies({value,options={},disabled,onChange}){
 const [choosing,setChoosing]=useState(null),[selected,setSelected]=useState([]);
 return <fieldset className="profile-dependencies"><legend>Dependencies</legend>{[['printers','Compatible printers'],['prints','Compatible process profiles']].map(([kind,label])=>{
  const list=`compatible_${kind}`,condition=`${list}_condition`,names=value[list]||[],available=options[kind==='prints'?'processes':'printers']||[],unique=[...new Set(available.map(item=>item.name))];
  return <div key={kind}><strong>{label}</strong><label><input type="checkbox" aria-label={`All ${label.toLowerCase()}`} checked={!names.length} disabled={disabled} onChange={event=>{if(event.target.checked)onChange({...value,[list]:[]});else{setChoosing(kind);setSelected(names);}}}/>All</label><button type="button" disabled={disabled} aria-label={`Set ${label.toLowerCase()}`} onClick={()=>{setChoosing(kind);setSelected(names);}}>Set…</button>
   {names.length>0&&<p>{names.join(', ')}</p>}
   <label>Condition<textarea aria-label={`${label} condition`} value={value[condition]||''} disabled={disabled||names.length>0} onChange={event=>onChange({...value,[condition]:event.target.value})}/></label>
   {choosing===kind&&<section role="group" aria-label={`Choose ${label.toLowerCase()}`}><p>Select compatible preset names. Selecting all or none stores All.</p>{unique.map(name=><label key={name}><input type="checkbox" aria-label={name} checked={selected.includes(name)} onChange={event=>setSelected(current=>event.target.checked?[...current,name]:current.filter(value=>value!==name))}/>{name}</label>)}
    {names.some(name=>!unique.includes(name))&&<p>Unavailable stored names are preserved on Cancel. Applying this list replaces them.</p>}
    <button type="button" onClick={()=>setChoosing(null)}>Cancel dependency choices</button><button type="button" onClick={()=>{onChange({...value,[list]:nativeDependencySelection(unique,selected)});setChoosing(null);}}>Apply dependency choices</button>
   </section>}
  </div>;
 })}</fieldset>;
}
