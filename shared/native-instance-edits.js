import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {instanceGroups,instanceGroupKey,instanceFamily,instanceDescriptor,assertInstanceFamilies} from './native-instances.js';
import {nativeMeshSourceGroup,normalizeNativeMeshSource} from './native-mesh-source.js';
import {meshPointMatrix,worldBrimEars,transformBrimEars} from './brim-ears.js';
import {sourceBounds} from './geometry.js';

// Orca 2.4.2 Selection.cpp 3027–3113: ModelVolume edits are shared; instance
// tilt/scale synchronizes the linear part while preserving each peer's XY.
// Project transactions remain immutable, so one edit produces one Undo entry.
const clone=value=>structuredClone(value);
const close=(a,b,tolerance=1e-9)=>a.elements.every((v,i)=>Math.abs(v-b.elements[i])<=tolerance);
const rounded=value=>Array.isArray(value)?value.map(rounded):typeof value==='number'?Number(value.toFixed(9)):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,rounded(value[k])])):value;
const linear=m=>{const next=m.clone();next.setPosition(0,0,0);return next;};
const metadataKeys=['objectName','partType','partSettings','objectSettings','layerConfigRanges','layerHeightProfile','cutId','cutConnector','textConfiguration'];
function paint(value){if(!value)return null;const {winding,...rest}=value;return rest;}
function shapeInFrame(part,frame){return part.native?.embossShape?{...part.native.embossShape,frame:frame.clone().invert().multiply(meshPointMatrix(part)).multiply(new Matrix4().fromArray(part.native.embossShape.frame)).toArray()}:null;}
function canonicalPart(part,frame){
 const source=normalizeNativeMeshSource(part),pose=meshPointMatrix(part),inverse=frame.clone().invert();
 let vertices,triangles,component;
 if(source){vertices=source.vertices;triangles=source.triangles;const currentBuild=pose.clone().multiply(new Matrix4().fromArray(source.build));component=close(currentBuild,frame)?new Matrix4().fromArray(source.component):inverse.clone().multiply(currentBuild).multiply(new Matrix4().fromArray(source.component));}
 else{
  // Topology tools explicitly invalidate meshSource. Retain the replacement's
  // actual vertices and faces; no old precision carrier may survive a rewrite.
  vertices=Array.from(part.positions);triangles=Array.from({length:vertices.length/3},(_,i)=>i);component=inverse.clone().multiply(pose);
  if(component.determinant()<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
 }
 return {part,vertices,triangles,component,shape:shapeInFrame(part,frame),ears:transformBrimEars(worldBrimEars(part),inverse),text:part.text?{...part.text,sourceMatrix:inverse.clone().multiply(pose).multiply(new Matrix4().fromArray(part.text.sourceMatrix)).toArray()}:null};
}
function signature(parts){return JSON.stringify(rounded(parts.map(p=>({name:p.part.name,vertices:p.vertices,triangles:p.triangles,component:p.component.toArray(),filamentSlot:p.part.filamentSlot||1,painting:paint(p.part.painting),native:Object.fromEntries(metadataKeys.map(key=>[key,p.part.native?.[key]??(['layerConfigRanges','layerHeightProfile'].includes(key)?[]:['objectSettings','partSettings'].includes(key)?{}:key==='partType'?'normal_part':null)])),shape:p.shape,ears:p.ears,text:p.text}))));}
function poseFields(positions,pose){
 const [x,y,z]=sourceBounds({positions}).center,center=new Vector3(x,y,z),position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();pose.decompose(position,rotation,scale);
 const rebuilt=new Matrix4().compose(position,rotation,scale);if(!close(pose,rebuilt,1e-7))throw new Error('The linked-instance viewport pose contains unsupported shear');
 const mapped=center.clone().applyMatrix4(pose),angles=new Euler().setFromQuaternion(rotation,'XYZ');
 return {position:mapped.sub(center).toArray(),rotation:[angles.x,angles.y,angles.z].map(v=>v*180/Math.PI),scale:scale.toArray()};
}
function materialize(canonical,frame,target,{id,groupId,family,plateId}={}){
 const source=canonical.part,pose=target?meshPointMatrix(target):new Matrix4(),localBuild=pose.clone().invert().multiply(frame),combined=localBuild.clone().multiply(canonical.component),reversed=combined.determinant()<0,positions=[];
 for(let f=0;f<canonical.triangles.length;f+=3)for(const v of reversed?[0,2,1]:[0,1,2]){const at=canonical.triangles[f+v]*3;positions.push(...new Vector3(...canonical.vertices.slice(at,at+3)).applyMatrix4(combined).toArray());}
 const native={...clone(source.native||{}),groupId,instanceFamily:family,meshSource:{version:1,vertices:[...canonical.vertices],triangles:[...canonical.triangles],build:localBuild.toArray(),component:canonical.component.toArray()}};
 delete native.groupTransform;
 for(const key of ['instanceId','instanceAutoDrop'])if(target?.native?.[key]!==undefined)native[key]=target.native[key];else delete native[key];
 if(canonical.shape)native.embossShape={...clone(canonical.shape),frame:localBuild.clone().multiply(new Matrix4().fromArray(canonical.shape.frame)).toArray()};else delete native.embossShape;
 const result={...clone(source),id,plateId,native,positions,...poseFields(positions,pose),visible:target?.visible??source.visible,printable:target?target.printable:source.printable};
 if(source.painting)result.painting={...clone(source.painting),winding:reversed?-1:1};
 if(canonical.ears.length)result.brimEars=transformBrimEars(canonical.ears,localBuild);else delete result.brimEars;
 if(canonical.text)result.text={...clone(canonical.text),sourceMatrix:localBuild.clone().multiply(new Matrix4().fromArray(canonical.text.sourceMatrix)).toArray()};else delete result.text;
 normalizeNativeMeshSource(result);return result;
}
/** Exact native unselected-instance matrix rule. The caller selects NONE for
 * world-Z-only rotation/translation, GENERAL for tilt/scale, RESET explicitly. */
export function synchronizedInstanceFrame(oldSelected,currentSelected,oldPeer,{rotation='general',autoDrop=true,sla=false}={}){
 const mirrored=Math.sign(oldSelected.determinant())!==Math.sign(currentSelected.determinant());let result=oldPeer.clone();
 if(rotation==='reset')throw new Error('Reset-rotation instance synchronization is not exposed by this editor');
 if(rotation!=='none'||mirrored){result=linear(oldPeer).multiply(linear(oldSelected).invert()).multiply(linear(currentSelected));result.setPosition(oldPeer.elements[12],oldPeer.elements[13],oldPeer.elements[14]);}
 if(!autoDrop&&!sla)result.elements[14]=currentSelected.elements[14];return result;
}
function rotationMode(before,after){
 const delta=linear(after).multiply(linear(before).invert()),e=delta.elements;
 return Math.abs(e[2])+Math.abs(e[6])+Math.abs(e[8])+Math.abs(e[9])+Math.abs(e[10]-1)<1e-8&&Math.abs(delta.determinant()-1)<1e-8&&Math.abs(e[0]*e[0]+e[1]*e[1]-1)<1e-8&&Math.abs(e[0]*e[4]+e[1]*e[5])<1e-8?'none':'general';
}
/** Shared metadata, part edits and membership reconcile before native export.
 * A whole-instance deletion/Clone/Fill remains distinct from a ModelVolume edit.
 * Conflicting edits of two copies fail atomically instead of picking a winner. */
export function reconcileNativeInstanceEdits(previous,proposed,{instanceScope=previous.selectionScope||'object',synchronizeInstances=true}={}){
 if(previous===proposed||previous.objects===proposed.objects)return proposed;
 const oldGroups=instanceGroups(previous.objects),byId=new Map(proposed.objects.map(o=>[o.id,o])),newGroups=instanceGroups(proposed.objects),families=new Map(),replace=new Map(),append=[],remove=new Set();
 for(const [key,parts]of oldGroups){const family=instanceFamily(parts);if(family){if(!families.has(family))families.set(family,[]);families.get(family).push({key,parts});}}
 for(const [family,groups]of families){
  if(groups.length<2||groups.every(({parts})=>parts.every(p=>byId.get(p.id)===p)&&newGroups.get(instanceGroupKey(parts[0]))?.length===parts.length))continue;
  assertInstanceFamilies(groups.flatMap(g=>g.parts));
  const states=[];
  for(const old of groups){const survivor=old.parts.map(p=>byId.get(p.id)).find(Boolean),parts=survivor?newGroups.get(instanceGroupKey(survivor)):newGroups.get(old.key);if(!parts)continue;
   if(parts.some(p=>p.native?.instanceFamily&&p.native.instanceFamily!==family))throw new Error('Joining different linked objects requires making them independent first');
   const oldFrame=instanceDescriptor(old.parts).frame,precise=nativeMeshSourceGroup(parts,[0,0,0]);
   const frame=instanceScope==='part'?oldFrame:precise?.build||oldFrame;
   const canonical=parts.map(p=>({...canonicalPart(p,frame),originIndex:old.parts.findIndex(original=>original.id===p.id)})),oldCanonical=old.parts.map(p=>canonicalPart(p,oldFrame));
   states.push({...old,parts,oldParts:old.parts,oldFrame,frame,canonical,changed:signature(canonical)!==signature(oldCanonical),moved:!close(oldFrame,frame)});
  }
  const changed=states.filter(s=>s.changed);let source=changed[0];
  if(changed.length>1&&changed.some(s=>signature(s.canonical)!==signature(source.canonical))){
   if(changed.some(s=>s.canonical.length!==s.oldParts.length||s.canonical.some((p,i)=>p.originIndex!==i)))throw new Error('Linked-instance membership received conflicting edits. Edit one instance at a time.');
   const merged=source.canonical.map((part,index)=>{const edits=changed.filter(s=>signature([s.canonical[index]])!==signature([canonicalPart(s.oldParts[index],s.oldFrame)]));if(edits.length>1&&edits.some(s=>signature([s.canonical[index]])!==signature([edits[0].canonical[index]])))throw new Error('The same linked part received conflicting edits in multiple instances. Edit one linked instance at a time.');return edits[0]?.canonical[index]||part;});
   source={...source,canonical:merged};
  }
  const moved=states.filter(s=>s.moved),driver=moved[0];
  for(const state of states){let frame=state.frame;
   if(synchronizeInstances&&instanceScope!=='part'&&driver&&!state.moved)frame=synchronizedInstanceFrame(driver.oldFrame,driver.frame,state.oldFrame,{rotation:rotationMode(driver.oldFrame,driver.frame),autoDrop:state.parts[0].native?.instanceAutoDrop!==false,sla:proposed.nativeSettings?.printer_technology==='SLA'});
   if(!source&&close(frame,state.frame))continue;
   const sourceState=source||state,canonical=sourceState.canonical;
   for(const part of state.parts)remove.add(part.id);
   for(let index=0;index<canonical.length;index++){
    const part=canonical[index].part,oldIndex=canonical[index].originIndex??sourceState.oldParts.findIndex(p=>p.id===part.id),target=source?state.parts.find(p=>p.id===state.oldParts[oldIndex]?.id):state.parts[index];
    const id=target?.id||(state.parts.some(p=>p.id===part.id)?part.id:crypto.randomUUID());
    const output=materialize(canonical[index],frame,target||state.parts[0],{id,groupId:state.parts[0].native?.groupId||state.parts[0].id,family,plateId:state.parts[0].plateId});
    if(byId.has(id))replace.set(id,output);else append.push(output);remove.delete(id);
   }
  }
 }
 if(!replace.size&&!append.length&&!remove.size){assertInstanceFamilies(proposed.objects);return proposed;}
 const objects=[...proposed.objects.filter(p=>!remove.has(p.id)).map(p=>replace.get(p.id)||p),...append];
 if(objects.length>10000||objects.reduce((n,p)=>n+p.positions.length/9,0)>2000000)throw new Error('Linked-instance propagation exceeds the project geometry limit');
 assertInstanceFamilies(objects);
 return {...proposed,objects,selectionFrame:null};
}
