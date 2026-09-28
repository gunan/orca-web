import {Matrix4} from 'three';
import {validateProject} from './project.js';
import {instanceGroups,assertInstanceFamilies} from './native-instances.js';
import {nativeMeshSourceGroup} from './native-mesh-source.js';
import {meshPointMatrix} from './brim-ears.js';
export const IMPORT_INSPECTION_REVISION='8500fcdccaa10b5099ac20d252af3a7c560046f1';
export const IMPORT_INSPECTION_LIMITS=Object.freeze({models:256,vertices:500000,triangles:500000,inputBytes:64*1024*1024});
const rows=values=>Array.from({length:values.length/3},(_,i)=>values.slice(i*3,i*3+3));
/** Preserve model identity separately from its visible instances. Native STL
 * statistics count solid volumes transformed by the first instance only. */
export function prepareNativeImportInspection(project){
 validateProject(project);assertInstanceFamilies(project.objects);const groups=new Map();
 for(const parts of instanceGroups(project.objects).values()){const key=parts[0].native?.instanceFamily||JSON.stringify([parts[0].plateId,parts[0].native?.groupId||parts[0].id]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(parts);}
 if(!groups.size||groups.size>IMPORT_INSPECTION_LIMITS.models)throw Error('Native import inspection requires 1–256 models.');
 let vertices=0,triangles=0;const members=new Map(),objects=[];
 for(const instances of groups.values()){
  const id=`model-${objects.length}`,first=instances[0],frames=instances.map(parts=>{const origin=project.plates.find(p=>p.id===parts[0].plateId)?.native?.origin||[0,0,0];if(!Array.isArray(origin)||origin.length!==3||!origin.every(Number.isFinite))throw Error('Invalid imported plate origin.');return nativeMeshSourceGroup(parts,origin);});
  const precise=frames.every(Boolean);if(instances.length>1&&!precise)throw Error('Linked import instances require retained native model frames.');
  const parts=first.map((part,index)=>{
   let points,faces,matrix;
   if(precise){const source=frames[0].sources[index];points=rows(source.vertices);faces=rows(source.triangles);matrix=source.component;}
   else{points=[];faces=[];const lookup=new Map();for(let offset=0;offset<part.positions.length;offset+=9){const face=[];for(let corner=0;corner<9;corner+=3){const point=part.positions.slice(offset+corner,offset+corner+3),key=point.join(',');if(!lookup.has(key)){lookup.set(key,points.length);points.push(point);}face.push(lookup.get(key));}faces.push(face);}matrix=meshPointMatrix(part).toArray();}
   vertices+=points.length;triangles+=faces.length;if(vertices>IMPORT_INSPECTION_LIMITS.vertices||triangles>IMPORT_INSPECTION_LIMITS.triangles)throw Error('Native import inspection exceeds 500000 vertices/triangles.');
   return{type:part.native?.partType||'normal_part',vertices:points,triangles:faces,matrix};
  });
  objects.push({id,parts,instances:precise?frames.map(f=>f.build.toArray()):[new Matrix4().toArray()],...(first[0].native?.cutId&&{cutId:structuredClone(first[0].native.cutId)})});members.set(id,instances.flat().map(o=>o.id));
 }
 const request={format:'orca-import-inspection-request',version:1,sourceRevision:IMPORT_INSPECTION_REVISION,operation:'inspect-import',objects};
 if(new TextEncoder().encode(JSON.stringify(request)).length>IMPORT_INSPECTION_LIMITS.inputBytes)throw Error('Native import inspection exceeds 64 MiB.');
 return{request,members,project};
}
export function validateNativeImportInspection(value,request){
 const fail=()=>{throw Error('Invalid native import inspection result.');};
 if(value?.format!=='orca-native-import-inspection'||value.version!==1||value.sourceRevision!==IMPORT_INSPECTION_REVISION||!Array.isArray(value.objects)||value.objects.length!==request.objects.length||!Array.isArray(value.retainedIds)||!Number.isInteger(value.removedCount)||value.removedCount<0||!['none','meters','inches'].includes(value.unitSuggestion))fail();
 const expected=[];for(const[index,object]of value.objects.entries()){if(object?.id!==request.objects[index].id||!Number.isFinite(object.volume))fail();if(object.volume>=1e-10)expected.push(object.id);}
 if(expected.length!==value.retainedIds.length||expected.some((id,i)=>id!==value.retainedIds[i])||value.removedCount!==value.objects.length-expected.length||(!expected.length&&value.unitSuggestion!=='none'))fail();
 return value;
}
export function applyNativeImportInspection(prepared,value){
 validateNativeImportInspection(value,prepared.request);const retained=new Set(value.retainedIds.flatMap(id=>prepared.members.get(id))),objects=prepared.project.objects.filter(o=>retained.has(o.id));
 const result={...prepared.project,objects,selectedId:objects[0]?.id||null,selectedIds:objects.length?[objects[0].id]:[],selectionScope:'object',selectionFrame:null};validateProject(result);assertInstanceFamilies(objects);return result;
}
