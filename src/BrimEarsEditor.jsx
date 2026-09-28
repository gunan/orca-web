import React,{useMemo,useRef,useState} from 'react';
import Modal from './Modal.jsx';
import SceneViewport from './SceneViewport.jsx';
import {groupBrimEars,updateBrimEars,brimEarMembers} from '../shared/brim-ears.js';
import {sceneBounds} from '../shared/geometry.js';
import {viewClipPlane} from '../shared/paint-clipping.js';
import {brimFirstLayer,brimDetectionRadiusMax,defaultBrimDiameter,autoBrimEars,addBrimEar,disconnectedBrimEars} from '../shared/brim-ear-auto.js';

export default function BrimEarsEditor({objects,selectedId,globalSettings={},bed,onChange,onClose}) {
  const members=useMemo(()=>brimEarMembers(objects,selectedId),[objects,selectedId]),bounds=useMemo(()=>sceneBounds(members.filter(object=>(object.native?.partType||'normal_part')==='normal_part')),[members]);
  const [ears,setEars]=useState(()=>groupBrimEars(objects,selectedId)),[selected,setSelected]=useState([]),[diameter,setDiameter]=useState(()=>defaultBrimDiameter(globalSettings)??''),[maxAngle,setMaxAngle]=useState(125),[detection,setDetection]=useState(1),[error,setError]=useState('');
  const [past,setPast]=useState([]),[future,setFuture]=useState([]),[rectangle,setRectangle]=useState(null),[clipRatio,setClipRatio]=useState(0),[clipDirection,setClipDirection]=useState([0,0,-1]);
  const cameraForward=useRef([0,0,-1]),latest=useRef(),stroke=useRef(null);latest.current={ears,selected,diameter};
  const firstLayer=useMemo(()=>{try{const polygons=brimFirstLayer(objects,selectedId);return{polygons,max:brimDetectionRadiusMax(polygons)};}catch(cause){return{error:cause.message,max:100};}},[objects,selectedId]);
  const disconnected=useMemo(()=>{try{return firstLayer.polygons&&ears.every(ear=>Number.isFinite(ear.radius)&&ear.radius>0&&ear.position.every(Number.isFinite))?disconnectedBrimEars(ears,firstLayer.polygons):[];}catch{return[];}},[ears,firstLayer]);
  const clipPlane=useMemo(()=>clipRatio?viewClipPlane({positions:[...bounds.min,...bounds.max,...bounds.min],position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},clipDirection,clipRatio):null,[bounds,clipDirection,clipRatio]);
  function restore(snapshot){setEars(snapshot.ears);setSelected(snapshot.selected);setDiameter(snapshot.diameter);setError('');}
  function commit(next,selection=selected,newDiameter=diameter){if(JSON.stringify(next)===JSON.stringify(ears)&&newDiameter===diameter){setSelected(selection);return;}setPast(value=>[...value,latest.current].slice(-100));setFuture([]);setEars(next);setSelected(selection);setDiameter(newDiameter);setError('');}
  function undo(){if(!past.length)return;setFuture(value=>[latest.current,...value]);restore(past.at(-1));setPast(past.slice(0,-1));}
  function redo(){if(!future.length)return;setPast(value=>[...value,latest.current]);restore(future[0]);setFuture(future.slice(1));}
  function add(position){try{const next=addBrimEar(ears,position,diameter);if(next!==ears)commit(next,[]);}catch(cause){setError(cause.message);}}
  function change(index,key,value,axis){commit(ears.map((ear,i)=>i===index?{...ear,[key]:axis===undefined?value:ear.position.map((coordinate,a)=>axis===a?value:coordinate)}:ear));}
  function select(indices){setSelected(indices);if(indices.length)setDiameter(ears[indices.at(-1)].radius*2);}
  function remove(indices){const removed=new Set(indices);if(!removed.size)return;commit(ears.filter((_,i)=>!removed.has(i)),[]);}
  function resize(value,hover=-1){const indices=new Set([...selected,...(hover>=0?[hover]:[])]);commit(ears.map((ear,index)=>indices.has(index)?{...ear,radius:value/2}:ear),selected,value);}
  function auto(){try{commit(autoBrimEars(ears,firstLayer.polygons,{diameter,maxAngle,detectionRadius:detection}),[]);}catch(cause){setError(cause.message);}}
  function apply(){try{onChange(updateBrimEars(objects,selectedId,ears));onClose();}catch(cause){setError(cause.message);}}
  function move(index,xy){const next=latest.current.ears.map((ear,i)=>i===index?{...ear,position:[...xy.map(Math.fround),ear.position[2]]}:ear);latest.current={...latest.current,ears:next};setEars(next);}
  function strokeStart(){stroke.current=latest.current;}
  function strokeEnd(){const previous=stroke.current;stroke.current=null;if(previous&&JSON.stringify(previous.ears)!==JSON.stringify(latest.current.ears)){setPast(value=>[...value,previous].slice(-100));setFuture([]);}}
  function clip(value){if(!clipRatio&&value)setClipDirection([...cameraForward.current]);setClipRatio(value);}
  const editing={ears,selected,diameter,disconnected,clipRatio,clipPlane,onAdd:add,onRemove:remove,onSelect:select,onMove:move,onStrokeStart:strokeStart,onStrokeEnd:strokeEnd,onDiameter:resize,onClip:clip,onRectangle:setRectangle};
  return <Modal aria-label="Brim ears" className="brim-ear-dialog" onClose={onClose}>
    <h2>Brim ears</h2><p>Click a model surface to add an ear on the build plate. Drag an ear to move it; right-click removes it. Diameter stays fixed when the object is scaled.</p>
    <div className="brim-ear-layout"><div><div className="brim-ear-preview"><SceneViewport objects={members} selectedId={null} onSelect={()=>{}} onTransform={()=>{}} mode="Brim ears" bed={bed} brimEditing={editing} clipPlane={clipPlane} onCameraDirection={direction=>{cameraForward.current=direction;}}/>{rectangle&&<div className="scene-selection-rectangle" aria-label="Brim ear selection rectangle" style={{left:Math.min(rectangle[0],rectangle[2]),top:Math.min(rectangle[1],rectangle[3]),width:Math.abs(rectangle[2]-rectangle[0]),height:Math.abs(rectangle[3]-rectangle[1])}}/>}</div>
    <p>Shift-drag selects visible ears; Alt-drag deselects. Ctrl/Cmd + wheel changes diameter; Alt + wheel moves the section. Ctrl/Cmd-drag orbits; Ctrl/Cmd+A selects all ears; Delete removes selected ears.</p>
    <div className="brim-ear-controls"><label>Head diameter (mm)<input aria-label="Head diameter" type="number" min=".01" max="2000" step=".1" value={diameter} onChange={event=>resize(event.target.value===''?'':Number(event.target.value))}/></label><input aria-label="Head diameter slider" type="range" min="5" max="20" step=".1" value={Math.max(5,Math.min(20,diameter||5))} onChange={event=>resize(Number(event.target.value))}/>
    <label>Max angle (°)<input aria-label="Max angle" type="number" min="0" max="180" step="1" value={maxAngle} onChange={event=>setMaxAngle(Number(event.target.value))}/></label><label>Detection radius (mm)<input aria-label="Detection radius" type="number" min="0" max={firstLayer.max} step=".1" value={detection} onChange={event=>setDetection(Number(event.target.value))}/></label><button disabled={Boolean(firstLayer.error)||!firstLayer.polygons?.length||ears.length>=1024} onClick={auto}>Auto-generate brim ears</button>
    <label>Section view<input aria-label="Brim section view" type="range" min="0" max="1" step=".01" value={clipRatio} onChange={event=>clip(Number(event.target.value))}/></label><button onClick={()=>{setClipDirection([...cameraForward.current]);setClipRatio(0);}}>Reset section view</button></div>
    <p>Auto-generate appends ears at corners of the native first-layer outline. Detection radius simplifies that outline before testing corner angles.</p>
    {disconnected.length>0&&<p role="status">Ears {disconnected.map(i=>i+1).join(', ')} are disconnected from the first-layer outline.</p>}
    {firstLayer.error&&<p role="status">Automatic detection unavailable: {firstLayer.error}</p>}
    </div><div className="brim-ear-list"><div className="brim-ear-actions"><button disabled={!past.length} onClick={undo}>Undo ear edit</button><button disabled={!future.length} onClick={redo}>Redo ear edit</button><button disabled={!ears.length} onClick={()=>select(ears.map((_,i)=>i))}>Select all ears</button><button disabled={!selected.length} onClick={()=>setSelected([])}>Deselect ears</button><button disabled={!selected.length} onClick={()=>remove(selected)}>Remove selected ears</button></div>
    {ears.map((ear,index)=><fieldset key={index}><legend><label><input type="checkbox" aria-label={`Select ear ${index+1}`} checked={selected.includes(index)} onChange={event=>select(event.target.checked?[...selected,index]:selected.filter(i=>i!==index))}/>Ear {index+1}</label></legend>{['X','Y','Z'].map((axis,a)=><label key={axis}>{axis}<input aria-label={`Ear ${index+1} ${axis}`} type="number" step=".1" value={ear.position[a]} onChange={event=>change(index,'position',event.target.value===''?'':Number(event.target.value),a)}/></label>)}<label>Diameter (mm)<input aria-label={`Ear ${index+1} diameter`} type="number" min=".01" step=".1" value={ear.radius===''?'':ear.radius*2} onChange={event=>change(index,'radius',event.target.value===''?'':Number(event.target.value)/2)}/></label><button onClick={()=>remove([index])}>Remove ear {index+1}</button></fieldset>)}
    <button disabled={ears.length>=1024} onClick={()=>add([bounds.min[0],bounds.min[1],0])}>Add brim ear</button><button disabled={!ears.length} onClick={()=>commit([],[])}>Remove all ears</button></div></div>
    {ears.some(ear=>Number(ear.position[2])>0)&&<p>Native slicing ignores ears above the build plate. Set Z to 0 for active adhesion.</p>}
    <p>Applying selects the native Painted brim mode for this object. The sliced Preview shows the actual adhesion paths.</p>
    {error&&<p role="alert">{error}</p>}<div className="unsaved-buttons"><button onClick={onClose}>Cancel changes</button><button onClick={apply}>Apply brim ears</button></div>
  </Modal>;
}
