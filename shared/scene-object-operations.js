import {bakeNativeEmbossMetadata,hasNativeEmboss} from './native-emboss.js';
import {worldBrimEars,transformBrimEars,meshPointMatrix} from './brim-ears.js';
import { bakeTextConfiguration } from './text-geometry.js';
import { Euler,Matrix4,Quaternion,Vector3 } from 'three';
import { arrangeObjects,bedBounds,createMesh,meshBounds,placeOnFace,sceneBounds,sourceBounds,transformPositions,translateMesh } from './geometry.js';

const id=()=>crypto.randomUUID(),groupId=object=>object.native?.groupId||object.id;
const vector=(value,label,{positive=false}={})=>{if(!Array.isArray(value)||value.length!==3||!value.every(number=>Number.isFinite(number)&&Math.abs(number)<=1e7&&(!positive||number>0&&number<=10000)))throw new Error(`Invalid ${label}`);return[...value];};
export function normalizeSceneGroupFrame(frame){
  if(!frame||frame.version!==1)throw new Error('Unsupported object transform frame');
  return{version:1,pivot:vector(frame.pivot,'object pivot'),position:vector(frame.position,'object position'),rotation:vector(frame.rotation,'object rotation'),scale:vector(frame.scale,'object scale',{positive:true})};
}
export function sceneSelectionMembers(objects,selectedId,{scope='object'}={}){
  if(!['object','part'].includes(scope))throw new Error('Choose object or part scope');
  const selected=objects.find(object=>object.id===selectedId);if(!selected)throw new Error('Selected object is missing');
  return scope==='part'?[selected]:objects.filter(object=>object.plateId===selected.plateId&&groupId(object)===groupId(selected));
}
function sharedFrame(members){
  const first=members[0].native?.groupTransform;if(!first||!members.every(object=>JSON.stringify(object.native?.groupTransform)===JSON.stringify(first)))return null;
  try{return normalizeSceneGroupFrame(first);}catch{return null;}
}
function quaternion(rotation){return new Quaternion().setFromEuler(new Euler(...rotation.map(value=>value*Math.PI/180),'XYZ'));}
function bake(object){
  const positions=Array.from(transformPositions(object));
  if(object.scale.reduce((product,value)=>product*value,1)<0)for(let offset=0;offset<positions.length;offset+=9)for(let axis=0;axis<3;axis++)[positions[offset+3+axis],positions[offset+6+axis]]=[positions[offset+6+axis],positions[offset+3+axis]];
  const native=object.native?{...object.native,...bakeNativeEmbossMetadata(object)}:undefined;if(native)delete native.groupTransform;
  return createMesh({...object,...(object.brimEars&&{brimEars:worldBrimEars(object)}),...(object.text&&{text:bakeTextConfiguration(object)}),positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],...(native&&{native})});
}
function prepared(members){
  const stored=sharedFrame(members);if(stored)return{members,frame:stored};
  const baked=members.map(bake),pivot=sceneBounds(baked.map(object=>({...object,visible:true})))?.center;if(!pivot)throw new Error('Object has no geometry');
  return{members:baked,frame:{version:1,pivot,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
}
function applyFrame(members,frame){
  frame=normalizeSceneGroupFrame(frame);const rotation=quaternion(frame.rotation),scale=new Vector3(...frame.scale);
  return members.map(object=>{
    const center=sourceBounds(object).center,offset=new Vector3(...center).sub(new Vector3(...frame.pivot)).multiply(scale).applyQuaternion(rotation);
    const position=center.map((value,axis)=>frame.pivot[axis]+frame.position[axis]+offset.getComponent(axis)-value);
    return{...object,position,rotation:[...frame.rotation],scale:[...frame.scale],native:{...object.native,groupId:groupId(members[0]),objectName:members[0].native?.objectName||members[0].name,partType:object.native?.partType||'normal_part',objectSettings:{...object.native?.objectSettings},partSettings:{...object.native?.partSettings},groupTransform:structuredClone(frame)}};
  });
}
function replace(objects,members){const replacements=new Map(members.map(object=>[object.id,object]));return objects.map(object=>replacements.get(object.id)||object);}
function clearFrame(objects,members){const converted=members.map(object=>{const native={...object.native};delete native.groupTransform;return{...object,native};});return{objects:replace(objects,converted),members:converted};}
function bounds(members){const normal=members.filter(object=>object.visible!==false&&(object.native?.partType||'normal_part')==='normal_part');return sceneBounds(normal.length?normal:members.map(object=>({...object,visible:true})));}

/** Inspector and transform gizmo proxy. For ordinary one-part objects this is
 * the original mesh. Native groups expose stable shared transform values. */
export function sceneSelectionObject(objects,selectedId,{scope='object'}={}){
  const members=sceneSelectionMembers(objects,selectedId,{scope});if(scope==='part'||members.length===1&&!sharedFrame(members))return members[0];
  const group=prepared(members),positions=group.members.flatMap(object=>object.positions);
  return createMesh({id:selectedId,name:members[0].native?.objectName||members[0].name,positions,position:group.frame.position,rotation:group.frame.rotation,scale:group.frame.scale,plateId:members[0].plateId,filamentSlot:members[0].filamentSlot,sceneGroupProxy:true,sceneGroupIds:members.map(object=>object.id),native:{...members[0].native,groupTransform:group.frame}});
}

export function updateSceneTransform(objects,selectedId,patch,{scope='object'}={}){
  const source=sceneSelectionMembers(objects,selectedId,{scope:'object'}),chosen=scope==='part'?source.filter(object=>object.id===selectedId):source;
  if(!['object','part'].includes(scope)||!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Invalid scene transform edit');
  for(const key of Object.keys(patch))if(!['position','rotation','scale','name','filamentSlot','plateId','visible'].includes(key))throw new Error(`Unsupported scene edit: ${key}`);
  for(const key of ['position','rotation','scale'])if(patch[key]!==undefined)vector(patch[key],key,{positive:key==='scale'});
  if(patch.name!==undefined&&(typeof patch.name!=='string'||patch.name.length>1000))throw new Error('Invalid object name');
  if(patch.filamentSlot!==undefined&&(!Number.isInteger(patch.filamentSlot)||patch.filamentSlot<1||patch.filamentSlot>64))throw new Error('Invalid filament slot');
  if(patch.plateId!==undefined&&(typeof patch.plateId!=='string'||!patch.plateId))throw new Error('Invalid plate');
  if(patch.visible!==undefined&&typeof patch.visible!=='boolean')throw new Error('Invalid visibility');
  if(scope==='part'||source.length===1&&!sharedFrame(source)){
    let current=objects,object=chosen[0];
    if(scope==='part'&&sharedFrame(source)){
      // Keep the entered part transform values while invalidating the shared
      // frame. A later object edit establishes a fresh frame from world surfaces.
      const cleared=clearFrame(objects,source),updated={...cleared.objects.find(item=>item.id===selectedId),...patch};if(object.brimEars)updated.brimEars=transformBrimEars(worldBrimEars(object),meshPointMatrix(updated).invert());return replace(cleared.objects,[updated]);
    }
    const original=object;object={...object,...patch};if(scope==='part'&&original.brimEars)object.brimEars=transformBrimEars(worldBrimEars(original),meshPointMatrix(object).invert());if(patch.name!==undefined&&object.native)object.native={...object.native,objectName:source.length===1?patch.name:object.native.objectName};
    return replace(current,[object]);
  }
  const group=prepared(source),frame={...group.frame};for(const key of ['position','rotation','scale'])if(patch[key]!==undefined)frame[key]=[...patch[key]];
  let members=applyFrame(group.members,frame);
  for(const key of ['filamentSlot','plateId','visible'])if(patch[key]!==undefined)members=members.map(object=>({...object,[key]:patch[key]}));
  if(patch.name!==undefined)members=members.map(object=>({...object,native:{...object.native,objectName:patch.name}}));
  if(patch.filamentSlot!==undefined)members=members.map(object=>{const native={...object.native,partSettings:{...object.native.partSettings}};delete native.partSettings.extruder;return{...object,native};});
  if(patch.plateId!==undefined&&objects.some(object=>!source.includes(object)&&object.plateId===patch.plateId&&groupId(object)===groupId(members[0]))){const unique=id();members=members.map(object=>({...object,native:{...object.native,groupId:unique}}));}
  return replace(objects,members);
}

export function translateSceneSelection(objects,selectedId,delta,{scope='object'}={}){
  vector(delta,'translation');const proxy=sceneSelectionObject(objects,selectedId,{scope});return updateSceneTransform(objects,selectedId,{position:proxy.position.map((value,index)=>value+delta[index])},{scope});
}
export function centerSceneSelection(objects,selectedId,bed,{scope='object'}={}){
  const current=bounds(sceneSelectionMembers(objects,selectedId,{scope})),target=bedBounds(bed);return translateSceneSelection(objects,selectedId,[target.center[0]-current.center[0],target.center[1]-current.center[1],0],{scope});
}
export function dropSceneSelection(objects,selectedId,bed,{scope='object'}={}){
  const current=bounds(sceneSelectionMembers(objects,selectedId,{scope}));return translateSceneSelection(objects,selectedId,[0,0,bedBounds(bed).min[2]-current.min[2]],{scope});
}
export function placeSceneOnFace(objects,selectedId,worldNormal,bed,{scope='object'}={}){
  const members=sceneSelectionMembers(objects,selectedId,{scope});
  if(scope==='part'||members.length===1&&!sharedFrame(members)){
    const source=sceneSelectionMembers(objects,selectedId),cleared=sharedFrame(source)?clearFrame(objects,source).objects:objects;
    const selected=cleared.find(object=>object.id===selectedId),placed=placeOnFace(selected,worldNormal,bed);
    if(selected.text||selected.brimEars||hasNativeEmboss(selected)||selected.native?.meshSource){const before=meshBounds(selected).center,after=meshBounds(placed).center,normal=new Vector3(...worldNormal).normalize(),axis=new Vector3(-normal.y,normal.x,0);if(axis.length()<1e-7)axis.set(1,0,0);else axis.normalize();const q=new Quaternion().setFromAxisAngle(axis,Math.acos(Math.max(-1,Math.min(1,-normal.z)))),matrix=new Matrix4().makeTranslation(...after).multiply(new Matrix4().makeRotationFromQuaternion(q)).multiply(new Matrix4().makeTranslation(...before.map(value=>-value)));if(hasNativeEmboss(selected)||selected.native?.meshSource)placed.native={...placed.native,...bakeNativeEmbossMetadata(selected,{worldMatrix:matrix})};if(selected.text)placed.text=bakeTextConfiguration(selected,{worldMatrix:matrix.toArray()});if(selected.brimEars)placed.brimEars=scope==='part'?worldBrimEars(selected):transformBrimEars(worldBrimEars(selected),matrix);}
    return replace(cleared,[placed]);
  }
  const normal=new Vector3(...vector(worldNormal,'face normal'));if(normal.length()<1e-8)throw new Error('Face normal cannot be zero');
  const before=bounds(members),proxy=sceneSelectionObject(objects,selectedId),q=new Quaternion().setFromUnitVectors(normal.normalize(),new Vector3(0,0,-1)).multiply(quaternion(proxy.rotation)),euler=new Euler().setFromQuaternion(q,'XYZ');
  let changed=updateSceneTransform(objects,selectedId,{rotation:[euler.x,euler.y,euler.z].map(value=>value*180/Math.PI)}),after=bounds(sceneSelectionMembers(changed,selectedId));
  return translateSceneSelection(changed,selectedId,[before.center[0]-after.center[0],before.center[1]-after.center[1],bedBounds(bed).min[2]-after.min[2]]);
}

export function duplicateSceneSelection(objects,selectedId,{scope='object',offset=[10,10,0]}={}){
  vector(offset,'duplicate offset');let source=sceneSelectionMembers(objects,selectedId,{scope}),current=objects;
  if(scope==='part'){const all=sceneSelectionMembers(objects,selectedId);if(sharedFrame(all)){const cleared=clearFrame(objects,all);current=cleared.objects;source=current.filter(object=>object.id===selectedId);}}
  const newGroup=id(),copies=source.map(object=>{
    const copy=structuredClone(object);if(scope==='part')delete copy.brimEars;copy.id=id();copy.name=`${object.name} copy`;
    if(scope==='object'&&copy.native){delete copy.native.instanceFamily;copy.native.groupId=newGroup;copy.native.objectName=`${object.native.objectName||object.name} copy`;}
    return copy;
  });
  const selected=copies[source.findIndex(object=>object.id===selectedId)]||copies[0];
  if(scope==='object'&&sharedFrame(copies)){const frame=sharedFrame(copies);frame.position=frame.position.map((value,index)=>value+offset[index]);source=applyFrame(copies,frame);}
  else source=copies.map(object=>translateMesh(object,offset));
  return{objects:[...current,...source],selectedId:selected.id,createdIds:source.map(object=>object.id)};
}

export function removeSceneSelection(objects,selectedId,{scope='object'}={}){
  const removed=sceneSelectionMembers(objects,selectedId,{scope}),ids=new Set(removed.map(object=>object.id));let next=objects.filter(object=>!ids.has(object.id));
  if(scope==='part'){
    const others=sceneSelectionMembers(objects,selectedId).filter(object=>!ids.has(object.id)),anchor=others.find(object=>(object.native?.partType||'normal_part')==='normal_part');
    if(others.length&&!anchor)throw new Error('Deleting this part would leave modifiers without a normal part; delete the object group or regroup its parts');
    const orphaned=removed.flatMap(worldBrimEars);
    if(anchor&&orphaned.length){const ears=[...worldBrimEars(anchor),...orphaned];next=replace(next,[{...anchor,brimEars:transformBrimEars(ears,meshPointMatrix(anchor).invert())}]);}
    if(sharedFrame(others))return clearFrame(next,others.map(object=>next.find(item=>item.id===object.id))).objects;
  }
  return next;
}

export function arrangeSceneObjects(objects,bed,{scope='object',gap=5,margin=5}={}){
  if(scope==='part'){
    let current=objects;const seen=new Set();for(const object of objects){const key=JSON.stringify([object.plateId,groupId(object)]);if(seen.has(key))continue;seen.add(key);const members=sceneSelectionMembers(current,object.id);if(sharedFrame(members))current=clearFrame(current,members).objects;}return arrangeObjects(current,bed,{gap,margin});
  }
  if(scope!=='object')throw new Error('Choose object or part scope');
  const groups=new Map();for(const object of objects){const key=JSON.stringify([object.plateId,groupId(object)]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(object);}
  const proxies=[];for(const members of groups.values()){if(members.every(object=>object.visible===false))continue;const box=bounds(members);if(!box)continue;proxies.push(createMesh({id:members[0].id,positions:[...box.min,...box.max,box.min[0],box.max[1],box.max[2]]}));}
  const arranged=arrangeObjects(proxies,bed,{gap,margin});let current=objects;
  for(const proxy of arranged)current=translateSceneSelection(current,proxy.id,proxy.position,{scope:'object'});
  return current;
}
