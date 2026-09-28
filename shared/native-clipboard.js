import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {bedBounds,createMesh,sceneBounds,sourceBounds} from './geometry.js';
import {selectedSceneIds} from './multi-selection.js';
import {meshPointMatrix} from './brim-ears.js';
import {nativeMeshSourceGroup} from './native-mesh-source.js';
import {bakeNativeEmbossMetadata} from './native-emboss.js';
import {bakeTextConfiguration} from './text-geometry.js';
import {invalidateCutMetadata} from './cut-metadata.js';
import {nativePlateOrigin} from './native-project.js';

export const CLIPBOARD_REVISION='8500fcdccaa10b5099ac20d252af3a7c560046f1';
export const CLIPBOARD_LIMITS=Object.freeze({objects:4096,triangles:500000,copies:1000,inputBytes:64*1024*1024});
const key=o=>JSON.stringify([o.plateId,o.native?.groupId||o.id]);
const identity=()=>new Matrix4();
const rows=(a,n)=>Array.from({length:a.length/n},(_,i)=>a.slice(i*n,i*n+n));
const normal=o=>(o.native?.partType||'normal_part')==='normal_part';
function matrix(value){if(!Array.isArray(value)||value.length!==16||value.some(v=>!Number.isFinite(v)||Math.abs(v)>1e8)||[3,7,11].some(i=>value[i]!==0)||value[15]!==1)throw new Error('Invalid native clipboard transform');const m=new Matrix4().fromArray(value);if(Math.abs(m.determinant())<1e-12)throw new Error('Singular native clipboard transform');return m;}
function indexed(o){const vertices=[],triangles=[],map=new Map();for(let i=0;i<o.positions.length;i+=9){const face=[];for(let j=0;j<9;j+=3){const p=o.positions.slice(i+j,i+j+3),key=p.join(',');if(!map.has(key)){map.set(key,vertices.length);vertices.push(p);}face.push(map.get(key));}triangles.push(face);}return{vertices,triangles};}
function origins(project,bed){const b=bedBounds(bed);return new Map(project.plates.map((plate,index)=>[plate.id,nativePlateOrigin(index,project.plates.length,{width:b.size[0],depth:b.size[1]})]));}
function groups(objects){const result=new Map();for(const o of objects){const id=key(o);if(!result.has(id))result.set(id,[]);result.get(id).push(o);}return result;}
function fallbackFrame(parts){
 const frame=parts[0].native?.groupTransform;
 if(frame&&parts.every(p=>JSON.stringify(p.native?.groupTransform)===JSON.stringify(frame)))return new Matrix4().makeTranslation(...frame.pivot.map((v,i)=>v+frame.position[i])).multiply(new Matrix4().makeRotationFromEuler(new Euler(...frame.rotation.map(v=>v*Math.PI/180),'XYZ'))).multiply(new Matrix4().makeScale(...frame.scale));
 if(parts.length===1)return meshPointMatrix(parts[0]).multiply(new Matrix4().makeTranslation(...sourceBounds(parts[0]).center));
 const box=sceneBounds(parts.filter(normal).map(p=>({...p,visible:true})))||sceneBounds(parts.map(p=>({...p,visible:true})));return new Matrix4().makeTranslation(...box.center);
}
export function nativeObjectFrame(parts,origin=[0,0,0]){return nativeMeshSourceGroup(parts,origin)?.build||new Matrix4().makeTranslation(...origin).multiply(fallbackFrame(parts));}
function modelGroup(id,parts,origin){
 const precise=nativeMeshSourceGroup(parts,origin),world=new Matrix4().makeTranslation(...origin),frame=precise?.build||world.clone().multiply(fallbackFrame(parts)),inverse=frame.clone().invert();
 return{id,inputFile:parts[0].sourceFile||'',matrix:frame.toArray(),parts:parts.map((part,index)=>{const source=precise?.sources[index];return{type:part.native?.partType||'normal_part',...(source?{vertices:rows(source.vertices,3),triangles:rows(source.triangles,3),matrix:source.component}:{...indexed(part),matrix:inverse.clone().multiply(world).multiply(meshPointMatrix(part)).toArray()})};})};
}
export function nativeObjectModel(parts,origin=[0,0,0]){return modelGroup('',parts,origin);}
function validCount(copies){if(!Number.isInteger(copies)||copies<1||copies>CLIPBOARD_LIMITS.copies)throw new Error('Clone count must be an integer from 1 to 1000');return copies;}
function editable(project){if(project.calibration||project.generatedPatternBinding)throw new Error('Generated calibration paths cannot be copied or cloned. Regenerate the calibration with the required layout.');if(project.plates.find(p=>p.id===project.activePlateId)?.locked)throw new Error('The active plate is locked');}
/** An application-local Model clipboard, matching native selection order. It is
 * independent from the OS text clipboard and is not saved with the project. */
export function captureNativeClipboard(project,bed,{scope=project.selectionScope||'object'}={}){
 editable(project);const selected=new Set(selectedSceneIds(project,{scope}));if(!selected.size)throw new Error('Select objects or parts to copy');const location=origins(project,bed),all=groups(project.objects),entries=[];
 for(const[id,members]of all){const parts=members.filter(p=>selected.has(p.id));if(!parts.length)continue;const complete=modelGroup(id,members,location.get(members[0].plateId)),indices=members.map((p,i)=>selected.has(p.id)?i:-1).filter(i=>i>=0);
  entries.push({id,origin:location.get(members[0].plateId),parts:structuredClone(parts),model:{...complete,parts:indices.map(i=>complete.parts[i])}});
 }
 if(scope==='part'&&entries.length!==1)throw new Error('Native part clipboard requires parts from one object');
 if(scope==='object'&&entries.some(e=>!e.parts.some(normal)))throw new Error('Whole-object clipboard needs a normal part in every object');
 if(entries.flatMap(e=>e.parts).reduce((n,p)=>n+p.positions.length/9,0)>CLIPBOARD_LIMITS.triangles)throw new Error('Clipboard exceeds the 500000-triangle limit');
 return{format:'orca-native-clipboard-source',version:1,sourceRevision:CLIPBOARD_REVISION,scope,entries};
}
export function nativePasteAvailability(project,clipboard){
 if(!clipboard?.entries?.length)return 'The model clipboard is empty';
 if(clipboard.scope==='object'&&(project.selectionScope||'object')!=='object')return 'Switch to whole-object selection to paste objects';
 if(clipboard.scope==='part'){
  const ids=new Set(selectedSceneIds(project,{scope:project.selectionScope||'object'})),chosen=project.objects.filter(o=>ids.has(o.id));
  if(!chosen.length||new Set(chosen.map(key)).size!==1)return 'Select one destination object to paste parts';
 }
 return null;
}
export function prepareNativePaste(project,clipboard,bed,{copies=1}={}){
 editable(project);validCount(copies);const unavailable=nativePasteAvailability(project,clipboard);if(unavailable)throw new Error(unavailable);
 if(clipboard.format!=='orca-native-clipboard-source'||clipboard.version!==1||clipboard.sourceRevision!==CLIPBOARD_REVISION)throw new Error('Unsupported model clipboard');
 const location=origins(project,bed),plate=project.plates.find(p=>p.id===project.activePlateId),origin=location.get(plate.id),bounds=bedBounds(bed),models=[...groups(project.objects)].map(([id,parts])=>modelGroup(id,parts,location.get(parts[0].plateId)));
 const clipboardObjects=clipboard.entries.map(e=>e.model),request={operation:'nearest-empty-cell',bedBounds:[bounds.min[0]+origin[0],bounds.min[1]+origin[1],bounds.max[0]+origin[0],bounds.max[1]+origin[1]],bedHeight:bounds.size[2],bedBaseZ:bounds.min[2],objects:models,clipboardObjects,...(clipboard.scope==='part'?{copies,pasteParts:{destinationId:key(project.objects.find(o=>o.id===project.selectedId))}}:{copies})};
 const added=clipboard.entries.flatMap(e=>e.parts).length*copies;
 if(project.objects.length+added>10000||models.length+clipboardObjects.length*copies>CLIPBOARD_LIMITS.objects)throw new Error('Clipboard operation exceeds the object limit');
 if([...models,...clipboardObjects].reduce((n,g)=>n+g.parts.reduce((m,p)=>m+p.triangles.length,0),0)>CLIPBOARD_LIMITS.triangles)throw new Error('Clipboard operation exceeds the 500000-triangle input limit');
 if(project.objects.reduce((n,p)=>n+p.positions.length/9,0)+clipboard.entries.flatMap(e=>e.parts).reduce((n,p)=>n+p.positions.length/9,0)*copies>2000000)throw new Error('Cloning exceeds the two million triangle project limit');
 if(new TextEncoder().encode(JSON.stringify(request)).length>CLIPBOARD_LIMITS.inputBytes)throw new Error('Clipboard request exceeds 64 MiB');
 return{request,clipboard,origin,plateId:project.activePlateId};
}
function translatedPart(source,delta,newGroup,plateId){
 const o=structuredClone(source);o.id=crypto.randomUUID();o.plateId=plateId;o.position=o.position.map((v,i)=>v+delta[i]);
 if(o.native){o.native=invalidateCutMetadata(o.native);delete o.native.instanceFamily;o.native.groupId=newGroup;if(o.native.groupTransform)o.native.groupTransform.position=o.native.groupTransform.position.map((v,i)=>v+delta[i]);}
 return o;
}
function transformedPart(source,delta,destination,newGroup,plateId){
 const full=delta.clone().multiply(meshPointMatrix(source)),positions=[];for(let i=0;i<source.positions.length;i+=3)positions.push(...new Vector3(...source.positions.slice(i,i+3)).applyMatrix4(full).toArray());
 const reflected=full.determinant()<0;if(reflected)for(let i=0;i<positions.length;i+=9)for(let a=0;a<3;a++)[positions[i+3+a],positions[i+6+a]]=[positions[i+6+a],positions[i+3+a]];
 const native={...invalidateCutMetadata(structuredClone(source.native||{})),...bakeNativeEmbossMetadata(source,{worldMatrix:delta}),groupId:newGroup,objectName:destination.native?.objectName||destination.name,objectSettings:structuredClone(destination.native?.objectSettings||{}),partType:source.native?.partType||'normal_part',partSettings:structuredClone(source.native?.partSettings||{})};
 delete native.groupTransform;delete native.instanceFamily;for(const k of ['layerHeightProfile','layerConfigRanges']){delete native[k];if(destination.native?.[k])native[k]=structuredClone(destination.native[k]);}
 const inheritedSlot=Number(source.native?.partSettings?.extruder)||destination.filamentSlot||Number(destination.native?.objectSettings?.extruder)||1;
 const o=createMesh({...structuredClone(source),filamentSlot:inheritedSlot,id:crypto.randomUUID(),positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],plateId,native,...(source.text&&{text:bakeTextConfiguration(source,{worldMatrix:delta.toArray()})}),...(source.painting&&reflected&&{painting:{...structuredClone(source.painting),winding:-(source.painting.winding||1)}})});delete o.brimEars;return o;
}
export function validateNativeClipboardResult(result,request){
 if(result?.format!=='orca-native-clipboard'||result.version!==1||result.sourceRevision!==CLIPBOARD_REVISION)throw new Error('Invalid native clipboard result');
 if(request.pasteParts){
  const source=request.clipboardObjects[0];if(result.destinationId!==request.pasteParts.destinationId||!Array.isArray(result.parts)||result.parts.length!==source.parts.length*(request.copies||1))throw new Error('Native part clipboard changed the requested parts');const seen=new Set();
  for(const item of result.parts){if(!Number.isInteger(item.sourceIndex)||item.sourceIndex<0||item.sourceIndex>=source.parts.length||!Number.isInteger(item.copy??0)||(item.copy??0)<0||(item.copy??0)>=(request.copies||1)||seen.has(`${item.copy??0}:${item.sourceIndex}`))throw new Error('Invalid native pasted part index');seen.add(`${item.copy??0}:${item.sourceIndex}`);const original=matrix(source.matrix).multiply(matrix(source.parts[item.sourceIndex].matrix));if(matrix(item.originalMatrix).elements.some((v,i)=>Math.abs(v-original.elements[i])>1e-7))throw new Error('Native part source transform changed');matrix(item.matrix);}
 }else{
  if(!Array.isArray(result.clones)||result.clones.length!==request.clipboardObjects.length*request.copies)throw new Error('Native clipboard changed the requested clone count');const sources=new Map(request.clipboardObjects.map(e=>[e.id,e])),seen=new Set();
  for(const item of result.clones){const source=sources.get(item.sourceId),tag=`${item.copy}:${item.sourceId}`;if(!source||!Number.isInteger(item.copy)||item.copy<0||item.copy>=request.copies||seen.has(tag))throw new Error('Invalid native clone identity');seen.add(tag);const original=matrix(source.matrix),actual=matrix(item.matrix);if(matrix(item.originalMatrix).elements.some((v,i)=>v!==original.elements[i]))throw new Error('Native clone source transform changed');if(actual.elements.some((v,i)=>![12,13,14].includes(i)&&Math.abs(v-original.elements[i])>1e-9))throw new Error('Native clone changed rotation or scale');}
 }
 return result;
}
export function applyNativePaste(project,prepared,result){
 const{request,clipboard,origin,plateId}=prepared;validateNativeClipboardResult(result,request);if(project.activePlateId!==plateId)throw new Error('The active plate changed during paste; try again');
 if(result?.format!=='orca-native-clipboard'||result.version!==1||result.sourceRevision!==CLIPBOARD_REVISION)throw new Error('Invalid native clipboard result');
 const created=[],selectedBatch=[],warnings=[];let objects=project.objects;
 if(request.pasteParts){
  const entry=clipboard.entries[0],destination=objects.find(o=>key(o)===request.pasteParts.destinationId);if(!destination||result.destinationId!==request.pasteParts.destinationId||!Array.isArray(result.parts)||result.parts.length!==entry.parts.length*(request.copies||1))throw new Error('Native part clipboard changed the requested parts');
  const seen=new Set(),newGroup=destination.native?.groupId||destination.id;
  for(const item of result.parts){if(!Number.isInteger(item.sourceIndex)||item.sourceIndex<0||item.sourceIndex>=entry.parts.length||!Number.isInteger(item.copy??0)||(item.copy??0)<0||(item.copy??0)>=(request.copies||1)||seen.has(`${item.copy??0}:${item.sourceIndex}`))throw new Error('Invalid native pasted part index');seen.add(`${item.copy??0}:${item.sourceIndex}`);const original=matrix(entry.model.matrix).multiply(matrix(entry.model.parts[item.sourceIndex].matrix));if(matrix(item.originalMatrix).elements.some((v,i)=>Math.abs(v-original.elements[i])>1e-7))throw new Error('Native part source transform changed');const delta=new Matrix4().makeTranslation(...origin.map(v=>-v)).multiply(matrix(item.matrix)).multiply(original.invert()).multiply(new Matrix4().makeTranslation(...entry.origin));created.push(transformedPart(entry.parts[item.sourceIndex],delta,destination,newGroup,plateId));if((item.copy??0)===(request.copies||1)-1)selectedBatch.push(created.at(-1).id);}
  // Changing a processed cut object's membership breaks its cut correspondence.
  const cut=destination.native?.cutId?.id;if(cut)warnings.push('Pasting parts detached the modified cut family; processed connector geometry is retained.');
  objects=objects.map(o=>{if(key(o)===key(destination)||cut&&o.native?.cutId?.id===cut){const native={...invalidateCutMetadata(o.native),groupId:o.native?.groupId||o.id};delete native.groupTransform;return{...o,native};}return o;});
 }else{
  if(!Array.isArray(result.clones)||result.clones.length!==clipboard.entries.length*request.copies)throw new Error('Native clipboard changed the requested clone count');const entries=new Map(clipboard.entries.map(e=>[e.id,e])),seen=new Set();
  for(const item of result.clones){const entry=entries.get(item.sourceId),tag=`${item.copy}:${item.sourceId}`;if(!entry||!Number.isInteger(item.copy)||item.copy<0||item.copy>=request.copies||seen.has(tag))throw new Error('Invalid native clone identity');seen.add(tag);const original=matrix(entry.model.matrix),actual=matrix(item.matrix);if(matrix(item.originalMatrix).elements.some((v,i)=>v!==original.elements[i]))throw new Error('Native clone source transform changed');if(actual.elements.some((v,i)=>![12,13,14].includes(i)&&Math.abs(v-original.elements[i])>1e-9))throw new Error('Native clone changed rotation or scale');const delta=[0,1,2].map(i=>actual.elements[12+i]-original.elements[12+i]+entry.origin[i]-origin[i]),newGroup=crypto.randomUUID();for(const part of entry.parts){created.push(translatedPart(part,delta,newGroup,plateId));if(item.copy===request.copies-1)selectedBatch.push(created.at(-1).id);}}
  if(created.some(o=>o.native?.cutId))throw new Error('Cloned cut identities must be detached');if(clipboard.entries.some(e=>e.parts.some(o=>o.native?.cutId)))warnings.push('Native clipboard copies retain connector geometry but do not copy the original cut-family identity.');
 }
 const selectedIds=selectedBatch;return{project:{...project,objects:[...objects,...created],selectedIds,selectedId:selectedIds[0]||null,selectionScope:clipboard.scope,selectionFrame:null,nativeWorkflow:true},warnings};
}
