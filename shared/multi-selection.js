import {bakeNativeEmbossMetadata} from './native-emboss.js';
import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {bedBounds,createMesh,sceneBounds,transformPositions} from './geometry.js';
import {sceneSelectionMembers,duplicateSceneSelection,normalizeSceneGroupFrame} from './scene-object-operations.js';
import {bakeTextConfiguration} from './text-geometry.js';
import {meshPointMatrix,worldBrimEars,transformBrimEars} from './brim-ears.js';

const group=object=>object.native?.groupId||object.id;
const key=object=>JSON.stringify([object.plateId,group(object)]);
export function selectedSceneIds(project,{scope='object'}={}) {
  if(!['object','part'].includes(scope))throw new Error('Choose object or part selection');
  const selected=project.objects.find(object=>object.id===project.selectedId&&object.plateId===project.activePlateId);
  if(!selected)return[];
  const input=Array.isArray(project.selectedIds)&&project.selectedIds.includes(selected.id)?project.selectedIds:[selected.id];
  const chosen=new Set(input.filter(id=>project.objects.some(object=>object.id===id&&object.plateId===project.activePlateId)));
  if(scope==='object')for(const id of [...chosen])for(const member of sceneSelectionMembers(project.objects,id))chosen.add(member.id);
  return project.objects.filter(object=>chosen.has(object.id)).map(object=>object.id);
}
export function selectSceneIds(project,ids,{scope='object',mode='replace'}={}) {
  if(!['object','part'].includes(scope)||!Array.isArray(ids)||ids.length>10000||ids.some(id=>typeof id!=='string')||!['replace','toggle','add','remove'].includes(mode))throw new Error('Invalid scene selection');
  const available=new Map(project.objects.filter(object=>object.plateId===project.activePlateId).map(object=>[object.id,object]));
  if(ids.some(id=>!available.has(id)))throw new Error('Selection must stay on the active plate');
  const requested=new Set();
  for(const id of ids)for(const member of sceneSelectionMembers(project.objects,id,{scope}))requested.add(member.id);
  const chosen=new Set(mode==='replace'?[]:selectedSceneIds(project,{scope}));
  const remove=mode==='remove'||mode==='toggle'&&[...requested].every(id=>chosen.has(id));
  for(const id of requested)if(remove)chosen.delete(id);else chosen.add(id);
  const ordered=project.objects.filter(object=>chosen.has(object.id)).map(object=>object.id),last=ids.at(-1);
  return {...project,selectedIds:ordered,selectedId:chosen.has(last)?last:ordered.at(-1)||null,selectionScope:scope,selectionFrame:null};
}
export function sceneSelectionCount(project,{scope='object'}={}) {
  const ids=new Set(selectedSceneIds(project,{scope}));
  return scope==='part'?ids.size:new Set(project.objects.filter(object=>ids.has(object.id)).map(key)).size;
}
function selectionFrame(project,scope) {
  const ids=selectedSceneIds(project,{scope}),members=project.objects.filter(object=>ids.includes(object.id));
  if(!members.length)throw new Error('Select objects to transform');
  const saved=project.selectionFrame;
  if(saved?.scope===scope&&JSON.stringify(saved.ids)===JSON.stringify(ids))return {...normalizeSceneGroupFrame(saved),ids,scope};
  const bounds=sceneBounds(members.map(object=>({...object,visible:true})));
  return {version:1,ids,scope,pivot:bounds.center,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
}
function matrix(frame) {
  const rotation=new Quaternion().setFromEuler(new Euler(...frame.rotation.map(value=>value*Math.PI/180),'XYZ'));
  return new Matrix4().compose(new Vector3(...frame.pivot.map((value,index)=>value+frame.position[index])),rotation,new Vector3(...frame.scale)).multiply(new Matrix4().makeTranslation(...frame.pivot.map(value=>-value)));
}
function pointsWithMatrix(positions,transform) {
  const result=[];
  for(let index=0;index<positions.length;index+=3)result.push(...new Vector3(...positions.slice(index,index+3)).applyMatrix4(transform).toArray());
  return result;
}
export function multipleSelectionObject(project,{scope='object'}={}) {
  const frame=selectionFrame(project,scope),chosen=new Set(frame.ids),inverse=matrix(frame).invert();
  const positions=project.objects.filter(object=>chosen.has(object.id)).flatMap(object=>pointsWithMatrix(transformPositions(object),inverse));
  return createMesh({id:project.selectedId,name:`${sceneSelectionCount(project,{scope})} selected ${scope==='part'?'parts':'objects'}`,positions,plateId:project.activePlateId,position:frame.position,rotation:frame.rotation,scale:frame.scale,sceneGroupProxy:true,sceneGroupIds:frame.ids,multipleSelection:true});
}
export function transformMultipleSelection(project,patch,{scope='object'}={}) {
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(name=>!['position','rotation','scale'].includes(name)))throw new Error('A multiple-selection transform accepts position, rotation or scale');
  const before=selectionFrame(project,scope),after={...before,...patch};
  normalizeSceneGroupFrame(after);
  const delta=matrix(after).multiply(matrix(before).invert()),chosen=new Set(before.ids),changedGroups=new Set(project.objects.filter(object=>chosen.has(object.id)).map(key));
  const objects=project.objects.map(object=>{
    if(!chosen.has(object.id)) {
      if(!changedGroups.has(key(object))||!object.native?.groupTransform)return object;
      const native={...object.native};delete native.groupTransform;return{...object,native};
    }
    const positions=pointsWithMatrix(transformPositions(object),delta),native=object.native?{...object.native,...bakeNativeEmbossMetadata(object,{worldMatrix:delta})}:undefined;
    if(native)delete native.groupTransform;
    return createMesh({...object,positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],...(native&&{native}),...(object.text&&{text:bakeTextConfiguration(object,{worldMatrix:delta.toArray()})}),...(object.brimEars&&{brimEars:scope==='part'?worldBrimEars(object):transformBrimEars(worldBrimEars(object),delta)})});
  });
  return {...project,objects,selectionFrame:after};
}
export function duplicateMultipleSelection(project,{scope='object'}={}) {
  const selected=new Set(selectedSceneIds(project,{scope})),seen=new Set(),sources=project.objects.filter(object=>selected.has(object.id)&&(!seen.has(scope==='object'?key(object):object.id)&&seen.add(scope==='object'?key(object):object.id)));
  let objects=project.objects;const copies=[];
  for(const object of sources){const result=duplicateSceneSelection(objects,object.id,{scope});objects=result.objects;copies.push(...result.createdIds);}
  return {...project,objects,selectedIds:copies,selectedId:copies[0]||null,selectionFrame:null};
}
export function removeMultipleSelection(project,{scope='object'}={}) {
  const chosen=new Set(selectedSceneIds(project,{scope})),removed=project.objects.filter(object=>chosen.has(object.id)),remaining=project.objects.filter(object=>!chosen.has(object.id));
  for(const object of remaining)if((object.native?.partType||'normal_part')!=='normal_part'&&!remaining.some(other=>key(other)===key(object)&&(other.native?.partType||'normal_part')==='normal_part'))throw new Error('Deleting these parts would leave a helper without a normal part; select the whole object or retain a normal part');
  const changedGroups=new Set(removed.map(key));
  const objects=remaining.map(object=>{
    if(scope==='object'||!changedGroups.has(key(object)))return object;
    const native=object.native?{...object.native}:undefined;if(native)delete native.groupTransform;
    const anchor=remaining.find(other=>key(other)===key(object)&&(other.native?.partType||'normal_part')==='normal_part');
    const orphaned=anchor?.id===object.id?removed.filter(other=>key(other)===key(object)).flatMap(worldBrimEars):[];
    return{...object,...(native&&{native}),...(orphaned.length&&{brimEars:transformBrimEars([...worldBrimEars(object),...orphaned],meshPointMatrix(object).invert())})};
  });
  return {...project,objects,selectedIds:[],selectedId:null,selectionFrame:null};
}


// Saved selection state is editing metadata, never an authority for geometry.
// Legacy single-selection files are accepted; stale membership clears the frame.
export function normalizeSelectionState(project) {
  const scope=project.selectionScope??'object';
  if(!['object','part'].includes(scope))throw new Error('Invalid saved selection scope');
  const ids=project.selectedIds;
  if(ids!==undefined&&(!Array.isArray(ids)||ids.length>10000||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length))throw new Error('Invalid saved selection IDs');
  if(project.selectedId!==undefined&&project.selectedId!==null&&typeof project.selectedId!=='string')throw new Error('Invalid primary selection');
  const active=project.objects.filter(object=>object.plateId===project.activePlateId);
  const primary=project.selectedId===null?null:active.find(object=>object.id===project.selectedId)?.id||active[0]?.id||null;
  const next={...project,selectedId:primary,selectionScope:scope};
  const selected=selectedSceneIds(next,{scope});
  let frame=null;
  if(project.selectionFrame!=null){
    const saved=project.selectionFrame,normalized=normalizeSceneGroupFrame(saved);
    if(!['object','part'].includes(saved.scope)||!Array.isArray(saved.ids)||saved.ids.some(id=>typeof id!=='string')||new Set(saved.ids).size!==saved.ids.length||saved.ids.length>10000)throw new Error('Invalid saved selection frame');
    if(saved.scope===scope&&JSON.stringify(saved.ids)===JSON.stringify(selected))frame={...normalized,ids:[...selected],scope};
  }
  return {...next,selectedIds:selected,selectionFrame:frame};
}

export function rectangleSceneSelection(project,ids,{additive=false}={}) {
  const selected=new Set(selectedSceneIds(project,{scope:project.selectionScope||'object'}));
  // Native keeps an existing superset, including its transform frame.
  if(ids.length&&ids.every(id=>selected.has(id)))return project;
  if(!ids.length)return additive?project:selectSceneIds(project,[],{scope:project.selectionScope||'object'});
  const modifiersOnly=ids.every(id=>{const object=project.objects.find(object=>object.id===id);return object&&(object.native?.partType||'normal_part')!=='normal_part';});
  return selectSceneIds(project,ids,{scope:modifiersOnly?'part':'object',mode:additive?'add':'replace'});
}

function selectedBounds(project,scope) {
  const selected=new Set(selectedSceneIds(project,{scope})),members=project.objects.filter(object=>selected.has(object.id));
  const normal=members.filter(object=>object.visible!==false&&(object.native?.partType||'normal_part')==='normal_part');
  return sceneBounds((normal.length?normal:members).map(object=>({...object,visible:true})));
}
export function centerMultipleSelection(project,bed,{scope='object'}={}) {
  const bounds=selectedBounds(project,scope),target=bedBounds(bed),frame=selectionFrame(project,scope);
  return transformMultipleSelection(project,{position:frame.position.map((value,index)=>value+(index<2?target.center[index]-bounds.center[index]:0))},{scope});
}
export function dropMultipleSelection(project,bed,{scope='object'}={}) {
  const bounds=selectedBounds(project,scope),frame=selectionFrame(project,scope),position=[...frame.position];position[2]+=bedBounds(bed).min[2]-bounds.min[2];
  return transformMultipleSelection(project,{position},{scope});
}
