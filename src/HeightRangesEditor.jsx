import {captureLayerClipboard,pasteLayerClipboard} from '../shared/native-settings-clipboard.js';
import React,{useState} from 'react';
import Modal from './Modal.jsx';
import {ProfileSettingInput} from './ProfileEditor.jsx';
import {displayedProfileSettings} from '../shared/profile-settings.js';
import {displayedObjectSettings,nativeGroupId} from '../shared/native-object-settings.js';
import {effectiveHeightRanges,heightRangeSettingDefinitions,updateHeightRanges} from '../shared/height-ranges.js';
import './native-parts.css';
import './height-ranges.css';

const vectorElements={coFloats:'number',coInts:'number',coStrings:'string',coBools:'boolean',coPercents:'number',coEnums:'enum'};
export default function HeightRangesEditor({project,selectedId=project.selectedId,globalSettings={},filamentCount=1,initialRangeIndex=0,clipboard=null,canPasteClipboard=true,onClipboardChange=()=>{},onChange,onClose}){
  const selected=project.objects.find(object=>object.id===selectedId),members=project.objects.filter(object=>object.plateId===selected?.plateId&&nativeGroupId(object)===nativeGroupId(selected||{}));
  const [ranges,setRanges]=useState(()=>structuredClone(selected?.native?.layerConfigRanges||[])),[index,setIndex]=useState(initialRangeIndex),[search,setSearch]=useState(''),[category,setCategory]=useState(''),[error,setError]=useState('');
  if(!selected)return null;
  const pages=[...new Set(heightRangeSettingDefinitions.map(definition=>definition.ui.page))],page=pages.includes(category)?category:pages[0];
  const rows=heightRangeSettingDefinitions.filter(definition=>search.trim()?`${definition.key} ${definition.label} ${definition.fullLabel} ${definition.tooltip}`.toLowerCase().includes(search.trim().toLowerCase()):definition.ui.page===page);
  const range=ranges[index],inherited={...displayedProfileSettings('process',globalSettings,{includeDefaults:true}),...displayedObjectSettings(selected.native?.objectSettings||{})},values={...inherited,...displayedObjectSettings(range?.settings||{})};
  let effective;try{effective=effectiveHeightRanges(ranges);}catch{effective=null;}
  function change(patch){setRanges(current=>current.map((item,i)=>i===index?{...item,...patch}:item));setError('');}
  function setting(key,value){change({settings:{...range.settings,[key]:value}});}
  function add(){const start=ranges.length?Math.max(...ranges.map(item=>Number(item.maxZ)||0)):0;setRanges(current=>[...current,{minZ:start,maxZ:start+2,settings:{layer_height:inherited.layer_height,extruder:'0'}}]);setIndex(ranges.length);setError('');}
  function remove(){setRanges(current=>current.filter((_,i)=>i!==index));setIndex(Math.max(0,index-1));setError('');}
  function copyRanges(all=false){try{onClipboardChange(captureLayerClipboard(ranges,clipboard,{indices:all?null:[index],filamentCount}));setError('');}catch(cause){setError(cause.message);}}
  function pasteRanges(){try{const draft={id:'height-range-draft',native:{layerConfigRanges:ranges}};const result=pasteLayerClipboard([draft],draft.id,clipboard,filamentCount,{printer:globalSettings});setRanges(result[0].native.layerConfigRanges);setError('');}catch(cause){setError(cause.message);}}
  function apply(){try{onChange(updateHeightRanges(project.objects,selected.id,ranges,filamentCount,{printer:globalSettings}));onClose();}catch(cause){setError(cause.message);}}
  return <Modal className="native-parts-editor height-ranges-editor" aria-label="Height range settings" onClose={onClose}>
    <header><h2>Height range settings · {selected.native?.objectName||selected.name}</h2><button aria-label="Close height ranges" onClick={onClose}>×</button></header>
    <p>Ranges belong to this entire object ({members.length} {members.length===1?'part':'parts'}). Z starts at the object's bottom, before any raft lift. The first layer keeps its configured height.</p>
    <div className="height-range-toolbar"><label>Height range<select aria-label="Selected height range" value={range?index:''} disabled={!ranges.length} onChange={event=>setIndex(Number(event.target.value))}>{!ranges.length&&<option value="">No ranges</option>}{ranges.map((item,i)=><option key={i} value={i}>{i+1}: {item.minZ}–{item.maxZ} mm</option>)}</select></label><button onClick={add} disabled={ranges.length>=1024}>Add height range</button><button onClick={remove} disabled={!range}>Remove height range</button><button onClick={()=>copyRanges()} disabled={!range}>Copy selected range</button><button onClick={()=>copyRanges(true)} disabled={!ranges.length}>Copy all ranges</button><button onClick={pasteRanges} disabled={!canPasteClipboard||!clipboard?.ranges?.length}>Paste height ranges</button></div>
    {range&&<><div className="height-range-bounds"><label>Start Z (mm)<input aria-label="Height range start" type="number" min="0" step=".1" value={range.minZ} onChange={event=>change({minZ:event.target.value===''?'':Number(event.target.value)})}/></label><label>End Z (mm)<input aria-label="Height range end" type="number" min="0" step=".1" value={range.maxZ} onChange={event=>change({maxZ:event.target.value===''?'':Number(event.target.value)})}/></label><label>Filament<select aria-label="Height range filament" value={range.settings.extruder??'0'} onChange={event=>setting('extruder',event.target.value)}><option value="0">Inherit from each part</option>{Array.from({length:filamentCount},(_,i)=><option key={i+1} value={i+1}>Slot {i+1}</option>)}</select></label></div>
    <div className="native-parts-navigation"><input aria-label="Search height range settings" placeholder="Search height range settings" value={search} onChange={event=>setSearch(event.target.value)}/><select aria-label="Height range settings category" value={page} disabled={Boolean(search)} onChange={event=>setCategory(event.target.value)}>{pages.map(name=><option key={name}>{name}</option>)}</select></div>
    <p className="native-inherit-description">Range overrides take priority over ordinary object and part settings. Modifiers take priority over ranges. Unchecked settings inherit separately from each part.</p>
    <div className="native-part-settings">{rows.map((definition,i)=>{
      const key=definition.key,mandatory=key==='layer_height',overridden=Object.hasOwn(range.settings,key),control={...definition,elementType:vectorElements[definition.nativeType]||definition.elementType};
      return <React.Fragment key={key}>{(i===0||rows[i-1].ui.group!==definition.ui.group)&&<h3>{definition.ui.group}</h3>}<div className={`native-part-setting ${overridden?'overridden':''}`} data-height-setting={key}>
        <label className="native-override-toggle" title={definition.tooltip}><input type="checkbox" aria-label={`Override height range ${key}`} checked={overridden} disabled={mandatory} onChange={event=>{if(event.target.checked)setting(key,structuredClone(values[key]));else{const next={...range.settings};delete next[key];change({settings:next});}}}/><span>{definition.label||definition.fullLabel||key}<small>{key}</small></span></label>
        <ProfileSettingInput definition={control} value={values[key]} disabled={!overridden} change={value=>setting(key,value)}/><small className="native-inherited-value">{mandatory?'Required per range':overridden?'Override':'Inherit from part'}</small>
      </div></React.Fragment>;
    })}{!rows.length&&<p>No native height range settings match.</p>}</div></>}
    {!ranges.length&&<p>No height overrides. Add a range to set layer height, walls, infill, speeds, material, or other native region settings.</p>}
    {!!ranges.length&&<details className="height-range-precedence"><summary>Effective ranges and overlap precedence</summary><p>Ranges sort by start, then end. Earlier ranges trim later overlapping ranges; their settings do not merge. Native slicing evaluates region settings at each layer's midpoint. Ranges above the object's top have no effect.</p>{effective&&<ol>{effective.map((item,i)=><li key={i}>{item.minZ}–{item.maxZ} mm · layer height {item.settings.layer_height} mm</li>)}</ol>}</details>}
    {error&&<p role="alert" className="native-parts-error">{error}</p>}
    <footer><small>{heightRangeSettingDefinitions.length} native height range controls</small><button onClick={onClose}>Cancel changes</button><button onClick={apply}>Apply height ranges</button></footer>
  </Modal>;
}
