import React, { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { ProfileSettingInput } from './ProfileEditor.jsx';
import { displayedProfileSettings } from '../shared/profile-settings.js';
import { displayedObjectSettings, nativeGroupId, NATIVE_PART_ROLES, normalizeNativeParts, objectSettingDefinitions, partSettingDefinitions, updateNativePart } from '../shared/native-object-settings.js';
import './native-parts.css';

const owns=(object,key)=>Object.hasOwn(object,key);
const settingLabel=definition=>definition.label||definition.fullLabel||definition.key;
const vectorElements={coFloats:'number',coInts:'number',coStrings:'string',coBools:'boolean',coPercents:'number',coEnums:'enum'};

/** Draft-only editor: the parent applies the returned objects through its
 * ordinary history transaction and activates the native project pipeline. */
export default function NativePartsEditor({project,selectedId=project.selectedId,globalSettings={},filamentCount=1,initialScope="object",onChange,onClose}){
  const [objects,setObjects]=useState(()=>structuredClone(project.objects));
  const [currentId,setCurrentId]=useState(selectedId||project.objects[0]?.id);
  const [scope,setScope]=useState(initialScope==='part'?'part':'object'),[search,setSearch]=useState(''),[category,setCategory]=useState(''),[error,setError]=useState('');
  const selected=objects.find(object=>object.id===currentId)||objects[0];
  const definitions=scope==='part'?partSettingDefinitions:objectSettingDefinitions;
  const pages=[...new Set(definitions.map(definition=>definition.ui.page))],page=pages.includes(category)?category:pages[0];
  const rows=definitions.filter(definition=>search.trim()?`${definition.key} ${definition.label} ${definition.fullLabel} ${definition.tooltip}`.toLowerCase().includes(search.trim().toLowerCase()):definition.ui.page===page);
  const groups=useMemo(()=>{
    const result=new Map();
    for(const object of objects.filter(object=>object.plateId===selected?.plateId))if(!result.has(nativeGroupId(object)))result.set(nativeGroupId(object),{id:nativeGroupId(object),name:object.native?.objectName||object.name});
    return [...result.values()];
  },[objects,selected?.plateId]);
  if(!selected)return null;
  const members=objects.filter(object=>object.plateId===selected.plateId&&nativeGroupId(object)===nativeGroupId(selected));
  const settings=selected.native?.[scope==='part'?'partSettings':'objectSettings']||{};
  const globalDisplay=displayedProfileSettings('process',globalSettings,{includeDefaults:true});
  const inherited=scope==='part'?{...globalDisplay,...displayedObjectSettings(selected.native?.objectSettings||{})}:globalDisplay;
  const values={...inherited,...displayedObjectSettings(settings)};
  function patch(change){setObjects(current=>updateNativePart(current,selected.id,change));setError('');}
  function setting(key,value){patch({[scope==='part'?'partSettings':'objectSettings']:{...settings,[key]:value}});}
  function inherit(key){const next={...settings};delete next[key];patch({[scope==='part'?'partSettings':'objectSettings']:next});}
  function apply(){try{const result=normalizeNativeParts(objects,filamentCount);onChange(result);onClose();}catch(cause){setError(cause.message);}}
  return <Modal className="native-parts-editor" aria-label="Object and part settings" onClose={onClose}>
    <header><h2>Object and part settings</h2><button onClick={onClose} aria-label="Close object and part settings">×</button></header>
    <div className="native-part-identity">
      <label>Part<select aria-label="Selected native part" value={selected.id} onChange={event=>{setCurrentId(event.target.value);setError('');}}>{objects.map(object=><option key={object.id} value={object.id}>{object.name} · {project.plates.find(plate=>plate.id===object.plateId)?.name}</option>)}</select></label>
      <label>Part name<input aria-label="Native part name" value={selected.name} onChange={event=>patch({name:event.target.value})}/></label>
      <label>Object group<select aria-label="Native object group" value={nativeGroupId(selected)} onChange={event=>patch({groupId:event.target.value})}>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <label>Object name<input aria-label="Native object name" value={selected.native?.objectName||selected.name} onChange={event=>patch({objectName:event.target.value})}/></label>
      <label>Part role<select aria-label="Native part role" value={selected.native?.partType||'normal_part'} onChange={event=>patch({partType:event.target.value})}>{Object.entries(NATIVE_PART_ROLES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Filament slot<select aria-label="Native part filament" value={selected.filamentSlot??(Number(selected.native?.partSettings?.extruder)||Number(selected.native?.objectSettings?.extruder)||1)} onChange={event=>patch({filamentSlot:Number(event.target.value)})}>{Array.from({length:filamentCount},(_,i)=><option key={i+1} value={i+1}>Slot {i+1}</option>)}</select></label>
    </div>
    <div className="native-group-description"><span>{members.length} {members.length===1?'part':'parts'} in this object. Negative volumes and modifiers affect normal parts in the same group.</span><button disabled={members.length===1} onClick={()=>patch({groupId:`part-${crypto.randomUUID()}`,objectName:selected.name})}>Make separate object</button></div>
    <div className="native-parts-navigation"><label>Settings scope<select aria-label="Native settings scope" value={scope} onChange={event=>{setScope(event.target.value);setSearch('');}}><option value="object">Object · all grouped parts</option><option value="part">This part</option></select></label><input aria-label="Search object settings" placeholder="Search object settings" value={search} onChange={event=>setSearch(event.target.value)}/><select aria-label="Object settings category" value={page} disabled={Boolean(search)} onChange={event=>setCategory(event.target.value)}>{pages.map(name=><option key={name}>{name}</option>)}</select></div>
    <p className="native-inherit-description">Unchecked settings inherit from {scope==='object'?'the global process':'the object, then the global process'}. {scope==='object'?`Object changes apply to ${members.length} grouped ${members.length===1?'part':'parts'}.`:'Only native region settings are available for individual parts.'}</p>
    <div className="native-part-settings">{rows.map((definition,index)=>{
      const key=definition.key,overridden=owns(settings,key),controlDefinition={...definition,elementType:vectorElements[definition.nativeType]||definition.elementType};
      return <React.Fragment key={key}>{(index===0||rows[index-1].ui.group!==definition.ui.group)&&<h3>{definition.ui.group}</h3>}<div className={`native-part-setting ${overridden?'overridden':''}`} data-native-setting={key}>
        <label className="native-override-toggle" title={definition.tooltip}><input type="checkbox" aria-label={`Override ${key}`} checked={overridden} onChange={event=>event.target.checked?setting(key,structuredClone(values[key])):inherit(key)}/><span>{settingLabel(definition)}<small>{key}</small></span></label>
        <ProfileSettingInput definition={controlDefinition} value={values[key]} disabled={!overridden} change={value=>setting(key,value)}/>
        <small className="native-inherited-value">{overridden?'Override':`Inherited: ${Array.isArray(values[key])?JSON.stringify(values[key]):String(values[key]??'—')}`}</small>
      </div></React.Fragment>;
    })}{!rows.length&&<p>No supported {scope} settings match this search.</p>}</div>
    {error&&<p role="alert" className="native-parts-error">{error}</p>}
    <footer><small>{rows.length} shown · {definitions.length} native {scope} settings</small><button onClick={()=>patch({[scope==='part'?'partSettings':'objectSettings']:{}})} disabled={!Object.keys(settings).length}>Reset {scope} overrides</button><button onClick={onClose}>Cancel changes</button><button onClick={apply}>Apply object settings</button></footer>
  </Modal>;
}
