import {prepareNativeCutToParts,applyNativeCutToParts} from '../shared/native-cut-to-parts.js';
import {linkedCutGroups,prepareNativeInstanceCut,applyNativeInstanceCut} from '../shared/native-instance-cut.js';
import {nativeEmbossLossMessage} from '../shared/native-emboss.js';
import {cutNativeGroupWithDovetail} from '../shared/dovetail-cut.js';
import {dovetailDefaults} from '../shared/dovetail-plan.js';
import {cutNativeGroupWithConnectors,cutPlaneFrame} from '../shared/cut-connectors.js';
import {hasFacetPainting} from '../shared/facet-correspondence.js';
import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import SceneViewport from './SceneViewport.jsx';
import { sceneBounds } from '../shared/geometry.js';
import { arrangeCutResult, nativeCutMembers } from '../shared/geometry-cut.js';
import './cut-dialog.css';

const directions={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]};
export default function CutDialog({object,objects,selectedId=object?.id,bed,plates,onApply,onClose}){
  const source=objects||[object],members=useMemo(()=>nativeCutMembers(source,selectedId),[objects,object,selectedId]);
  const linked=useMemo(()=>linkedCutGroups(source,selectedId).length>1,[source,selectedId]);
  const[cutFlags,setCutFlags]=useState({upper:{placeOnCut:false,flip:false},lower:{placeOnCut:false,flip:false}});
  const bounds=useMemo(()=>sceneBounds(members),[members]);
  const[axis,setAxis]=useState('Z'),[custom,setCustom]=useState(['0','0','1']),[offset,setOffset]=useState(String(bounds.center[2]));
  const[keep,setKeep]=useState('both'),[placement,setPlacement]=useState(linked?'original':'side-by-side'),[preview,setPreview]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(true);
  const painted=members.some(hasFacetPainting),[clearPaint,setClearPaint]=useState(false),nativeTextLoss=nativeEmbossLossMessage(members),[clearNativeText,setClearNativeText]=useState(false);
  const[connectors,setConnectors]=useState([]),[keepAsParts,setKeepAsParts]=useState(false);
  const[mode,setMode]=useState('planar'),[dovetail,setDovetail]=useState(()=>dovetailDefaults(bounds));
  const normal=axis==='Custom'?custom.map(Number):directions[axis];
  const signature=JSON.stringify({axis,custom,offset,keep,placement,connectors,mode,dovetail,cutFlags,keepAsParts});
  useEffect(()=>{
    setPending(true);setError('');
    const controller=new AbortController();
    const timer=setTimeout(async()=>{try{let result;if(!offset.trim())throw new Error('Enter a plane offset');if(keepAsParts){const prepared=prepareNativeCutToParts({objects:source,plates,selectedId,bed},{normal,offset:Number(offset),keep,mode,connectors,...cutFlags}),response=await fetch('/api/geometry/cut-to-parts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(prepared.request),signal:controller.signal}),value=await response.json();if(!response.ok)throw new Error(value.error||'Native Cut to parts failed');result=applyNativeCutToParts(prepared,value);}else{result=mode==='dovetail'?cutNativeGroupWithDovetail(source,selectedId,{normal,offset:Number(offset),keep,dovetail}):cutNativeGroupWithConnectors(source,selectedId,{normal,offset:Number(offset),keep,connectors});if(linked){if(placement!=='original')throw new Error('Native Cut uses instance placement. Arrange after applying the cut if needed.');const prepared=prepareNativeInstanceCut({objects:source,plates,selectedId,bed},result,cutFlags),response=await fetch('/api/geometry/instance-cut',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(prepared.request),signal:controller.signal}),value=await response.json();if(!response.ok)throw new Error(value.error||'Native linked Cut failed');result=applyNativeInstanceCut(prepared,value);}else if(placement==='side-by-side')result=arrangeCutResult(result,bed);}if(!controller.signal.aborted)setPreview(result);}catch(cause){if(!controller.signal.aborted){setPreview(null);setError(cause.message);}}finally{if(!controller.signal.aborted)setPending(false);}},150);
    return()=>{clearTimeout(timer);controller.abort();};
  },[signature,objects,object,selectedId,JSON.stringify(bed),plates,linked]);
  const visible=useMemo(()=>{
    if(!preview)return members;
    const up=new Set(preview.upper.map(part=>part.id));
    return preview.created.filter(part=>part.plateId===members[0].plateId).map(part=>({...part,filamentSlot:up.has(part.id)?1:2}));
  },[preview,members]);
  function addConnector(){try{const frame=cutPlaneFrame(normal,Number(offset)),u=bounds.center.reduce((sum,value,index)=>sum+value*frame.u[index],0),v=bounds.center.reduce((sum,value,index)=>sum+value*frame.v[index],0);setKeep('both');setConnectors(current=>[...current,{type:'plug',style:'prism',shape:'circle',u:u+current.length*5,v,diameter:2.5,depth:3,radiusTolerance:0,heightTolerance:.1,rotation:0,snapSpace:.3,snapBulge:.15}]);}catch(cause){setError(cause.message);}}
  function changeConnector(index,field,value){setConnectors(current=>current.map((entry,i)=>i===index?{...entry,[field]:value}:entry));}
  function chooseAxis(value){setAxis(value);if(directions[value])setOffset(String(directions[value].reduce((sum,number,index)=>sum+number*bounds.center[index],0)));}
  return <Modal className="cut-dialog" aria-label="Cut object" onClose={onClose}>
    <header><h2>Cut · {object?.native?.objectName||object?.name||members[0].name}</h2><button aria-label="Close cut tool" onClick={onClose}>×</button></header>
    <div className="cut-controls"><label>Mode<select aria-label="Cut mode" value={mode} onChange={event=>{setMode(event.target.value);setKeepAsParts(false);}}><option value="planar">Planar</option><option value="dovetail">Dovetail</option></select></label><label>Plane normal<select aria-label="Cut plane axis" value={axis} onChange={event=>chooseAxis(event.target.value)}>{['X','Y','Z','Custom'].map(value=><option key={value}>{value}</option>)}</select></label>
      {axis==='Custom'&&<fieldset><legend>Normal direction</legend>{['X','Y','Z'].map((name,index)=><label key={name}>{name}<input aria-label={`Cut normal ${name}`} type="number" step="any" value={custom[index]} onChange={event=>setCustom(current=>current.map((value,i)=>i===index?event.target.value:value))}/></label>)}</fieldset>}
      <label>Plane offset (mm)<input aria-label="Cut plane offset" type="number" step="any" value={offset} onChange={event=>setOffset(event.target.value)}/></label>
      <label>Retain<select aria-label="Cut retained sides" disabled={keepAsParts||mode==='planar'&&connectors.length>0} value={keep} onChange={event=>setKeep(event.target.value)}><option value="both">Both sides</option><option value="upper">Upper / positive side</option><option value="lower">Lower / negative side</option></select></label>
      <label>Placement<select aria-label="Cut result placement" value={placement} onChange={event=>setPlacement(event.target.value)}><option value="side-by-side" disabled={linked||keepAsParts}>On bed, side by side</option><option value="original">{linked||keepAsParts?'Native instance placement':'Keep current placement'}</option></select></label>
    </div>
    <label><input type="checkbox" aria-label="Cut to parts" checked={keepAsParts} disabled={mode!=='planar'||connectors.length>0} onChange={event=>{setKeepAsParts(event.target.checked);if(event.target.checked){setKeep('both');setPlacement('original');setCutFlags({upper:{placeOnCut:false,flip:false},lower:{placeOnCut:false,flip:false}});}}}/>Cut to parts</label>
    {keepAsParts&&<p>Both sides become parts of one native object. Modifiers remain uncut once. Native instance placement is applied to the combined object.</p>}
    {linked&&<fieldset><legend>Native linked-instance placement</legend>{['upper','lower'].map(side=><div key={side}>{['placeOnCut','flip'].map(key=><label key={key}><input type="checkbox" aria-label={`${side} ${key==='placeOnCut'?'place on cut face':'flip'}`} checked={cutFlags[side][key]} disabled={keepAsParts} onChange={event=>setCutFlags(current=>({...current,[side]:{...current[side],[key]:event.target.checked}}))}/>{side}: {key==='placeOnCut'?'place on cut face':'flip'}</label>)}</div>)}<p>Changes apply to every linked instance. Native scale/tilt reset and automatic bed placement preserve each peer’s XY offset and auto-drop flag.</p></fieldset>}
    {mode==='dovetail'&&<section aria-label="Dovetail parameters"><h3>Dovetail</h3><div className="cut-controls">{[['depth','Depth (mm)'],['width','Width (mm)'],['depthTolerance','Depth clearance (mm)'],['widthTolerance','Width clearance (mm)'],['flapAngle','Flap angle (°)'],['grooveAngle','Groove angle (°)'],['count','Count'],['gap','Gap (mm)'],['rotation','Direction in plane (°)']].map(([key,label])=><label key={key}>{label}<input aria-label={`Dovetail ${label}`} type="number" step={key==='count'?'1':'any'} disabled={key==='gap'&&dovetail.count===1} value={Number.isNaN(dovetail[key])?'':dovetail[key]} onChange={event=>setDovetail(current=>({...current,[key]:event.target.value.trim()?Number(event.target.value):NaN}))}/></label>)}</div><p>Native tapered cut surfaces include width and depth clearances. Closed fragments stay in their cut object for native slicing. Planar connectors are unavailable in this mode. Normal parts must use one filament and object-level settings.</p></section>}
    {mode==='planar'&&<section className="cut-connectors" aria-label="Cut connectors"><header><h3>Connectors</h3><button onClick={addConnector} disabled={keepAsParts||connectors.length>=128}>Add connector</button></header>
      {connectors.length>0&&<p>U and V are coordinates in the cut plane. Both sides are retained. Holes include the radial and height clearances; dowels become separate upright parts.</p>}
      {connectors.some(connector=>connector.type==='dowel'&&connector.style==='frustum')&&<p role="note">Frustum dowels taper to a point. Orient the separate dowel onto a suitable face or enable supports before slicing; native OrcaSlicer can reject the upright dowel as floating.</p>}
      {connectors.map((connector,index)=><fieldset key={index}><legend>Connector {index+1}</legend><div className="cut-controls">
        {[['type','Type',['plug','dowel','snap']],['style','Style',['prism','frustum']],['shape','Shape',['circle','hexagon','square','triangle']]].map(([key,label,values])=><label key={key}>{label}<select aria-label={`Connector ${index+1} ${label}`} disabled={connector.type==='snap'&&key!=='type'} value={connector.type==='snap'&&key==='shape'?'circle':connector.type==='snap'&&key==='style'?'prism':connector[key]} onChange={event=>changeConnector(index,key,event.target.value)}>{values.map(value=><option key={value}>{value}</option>)}</select></label>)}
        {[['u','U (mm)'],['v','V (mm)'],['diameter','Diameter (mm)'],['depth','Depth (mm)'],['radiusTolerance','Radial clearance (mm)'],['heightTolerance','Height clearance (mm)'],['rotation','Rotation (°)'],...(connector.type==='snap'?[['snapSpace','Snap space ratio'],['snapBulge','Snap bulge ratio']]:[])].map(([key,label])=><label key={key}>{label}<input type="number" step="any" aria-label={`Connector ${index+1} ${label}`} value={Number.isNaN(connector[key])?'':connector[key]} onChange={event=>changeConnector(index,key,event.target.value.trim()?Number(event.target.value):NaN)}/></label>)}
        <button aria-label={`Remove connector ${index+1}`} onClick={()=>setConnectors(current=>current.filter((_,i)=>i!==index))}>Remove</button>
      </div></fieldset>)}
    </section>}
    <p>The plane offset is measured from the world origin along its normal. All {members.length} {members.length===1?'part':'grouped parts'} use the same plane. Cut surfaces are closed with caps.</p>
    <div className="cut-preview" aria-label="Cut geometry preview"><SceneViewport objects={visible} selectedId={null} onSelect={()=>{}} onTransform={()=>{}} onPlaceFace={()=>{}} mode="View" bed={bed} filamentColors={['#e59d36','#49a8cf']} wireframe={false}/></div>
    {pending?<p role="status">Computing closed cut surfaces…</p>:error?<p role="alert">{error}</p>:<p role="status">{preview.created.length} retained {preview.created.length===1?'part':'parts'} · {preview.created.reduce((sum,part)=>sum+part.positions.length/9,0)} triangles · Upper: amber, lower/dowels: blue.{preview.report.resetLayerProfiles>0&&` Variable layer profiles on cut parts were reset because the object height changed.`}{preview.report.discarded.length>0&&` ${preview.report.discarded.length} modifier-only parts outside a remaining normal object are omitted.`}</p>}
    {painted&&<label className="paint-loss-consent"><input aria-label="Clear painting from cut parts" type="checkbox" checked={clearPaint} onChange={event=>setClearPaint(event.target.checked)}/>Cut changes triangle topology and clears support, seam, color and fuzzy painting on the cut parts. Clear this painting and apply the cut.</label>}
    {nativeTextLoss&&<label className="paint-loss-consent"><input aria-label="Remove native text editing metadata" type="checkbox" checked={clearNativeText} onChange={event=>setClearNativeText(event.target.checked)}/>{nativeTextLoss} Remove this metadata and apply the cut.</label>}
    <footer><span>{mode==='dovetail'?'Dovetail cut · native flap, taper, count and clearance parameters':keepAsParts?'Planar cut · both sides in one native object':'Planar cut · plug, dowel and snap connectors'}</span><button onClick={onClose}>Cancel cut</button><button disabled={pending||!preview||painted&&!clearPaint||!!nativeTextLoss&&!clearNativeText} onClick={()=>{onApply(preview.created,{replaceIds:preview.replaceIds,report:preview.report});onClose();}}>Apply cut</button></footer>
  </Modal>;
}
