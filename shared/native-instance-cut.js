import {Matrix4,Vector3,Quaternion} from 'three';
import {instanceGroups,instanceFamily,instanceDescriptor,instanceGroupKey,assertInstanceFamilies,normalizeInstanceAutoDrop} from './native-instances.js';
import {meshPointMatrix} from './brim-ears.js';
import {nativePlateOrigin} from './native-project.js';
import {bedBounds,meshBounds,sceneBounds} from './geometry.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';
export const INSTANCE_CUT_REVISION='8500fcdccaa10b5099ac20d252af3a7c560046f1';
const identity=()=>new Matrix4(),matrix=value=>new Matrix4().fromArray(value);
const finite=(value,label)=>{if(!Array.isArray(value)||value.length!==16||!value.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6)||[3,7,11].some(i=>value[i]!==0)||value[15]!==1||Math.abs(matrix(value).determinant())<1e-12)throw new Error(`Invalid ${label} matrix`);return matrix(value);};
export function linkedCutGroups(objects,selectedId){const selected=objects.find(o=>o.id===selectedId);if(!selected)throw new Error('Selected Cut object is missing');const family=selected.native?.instanceFamily;return [...instanceGroups(objects).values()].filter(parts=>family?instanceFamily(parts)===family:parts.some(o=>o.id===selectedId));}
export function prepareNativeInstanceCut({objects,plates,selectedId,bed},result,{upper={},lower={}}={}){
 assertInstanceFamilies(objects);const groups=linkedCutGroups(objects,selectedId),selected=groups.find(parts=>parts.some(o=>o.id===selectedId));if(groups.length<2)throw new Error('Native linked Cut requires two or more shared instances');if(groups.length>256)throw new Error('Native Cut supports at most 256 linked instances');
 const bounds=bedBounds(bed),plateBed={width:bounds.size[0],depth:bounds.size[1],height:bounds.size[2]};
 const origins=new Map(plates.map((p,i)=>[p.id,nativePlateOrigin(i,plates.length,plateBed)]));
 const instances=groups.map(parts=>{const origin=origins.get(parts[0].plateId);if(!origin)throw new Error('Cut instance plate is missing');return{id:instanceGroupKey(parts[0]),matrix:new Matrix4().makeTranslation(...origin).multiply(instanceDescriptor(parts).frame).toArray(),autoDrop:normalizeInstanceAutoDrop(parts[0].native?.instanceAutoDrop),printable:parts[0].printable!==false};});
 const selectedInstanceId=instanceGroupKey(selected[0]),selectedFrame=instanceDescriptor(selected).frame,offset=new Vector3().setFromMatrixPosition(selectedFrame),normal=new Vector3(...result.report.normal).normalize(),rotation=new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,0,1),normal));
 const positive=new Set(result.upper.map(o=>o.id)),negative=new Set(result.lower.map(o=>o.id)),dowels=new Set((result.dowels||[]).map(o=>o.id));let vertices=0,triangles=0;
 const results=[...instanceGroups(result.created)].map(([id,parts])=>{const first=parts[0],side=dowels.has(first.id)?'dowel':positive.has(first.id)?'upper':negative.has(first.id)?'lower':null;if(!side)throw new Error('Cut result is missing its native side');const flags=side==='upper'?upper:side==='lower'?lower:{};
  return{id,side,placeOnCut:flags.placeOnCut===true,flip:flags.flip===true,parts:parts.map(part=>{const transform=meshPointMatrix(part),points=[],faces=[],sourceOffset=side==='dowel'?new Vector3(offset.x,offset.y,meshBounds(part).center[2]):offset;for(let i=0;i<part.positions.length;i+=3){const point=new Vector3(...part.positions.slice(i,i+3)).applyMatrix4(transform).sub(sourceOffset);if(point.toArray().some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))throw new Error('Cut coordinates exceed native bounds');points.push(point.toArray().map(Math.fround));}for(let i=0;i<points.length;i+=3)faces.push([i,i+1,i+2]);vertices+=points.length;triangles+=faces.length;return{type:part.native?.partType||'normal_part',vertices:points,triangles:faces};})};
 });
 if(vertices>500000||triangles>500000||triangles*instances.length>2000000)throw new Error('Cut exceeds 500000 source or two million expanded triangles');
 const request={format:'orca-instance-cut-request',version:1,sourceRevision:INSTANCE_CUT_REVISION,operation:'instance-cut-frames',selectedInstanceId,instances,cutRotation:rotation.toArray(),results};
 if(new TextEncoder().encode(JSON.stringify(request)).length>64*1024*1024)throw new Error('Native Cut request exceeds 64 MiB');
 return{request,groups,origins,result,selectedId,bed:plateBed};
}
export function validateNativeInstanceCutResult(value,request){
 if(value?.format!=='orca-native-instance-cut'||value.version!==1||value.sourceRevision!==INSTANCE_CUT_REVISION||value.selectedInstanceId!==request.selectedInstanceId||!Array.isArray(value.results)||value.results.length!==request.results.length)throw new Error('Invalid native Cut result identity');
 const source=new Map(request.results.map(item=>[item.id,item])),seen=new Set();
 for(const result of value.results){const input=source.get(result.id);if(!input||seen.has(result.id)||result.side!==input.side||!Array.isArray(result.instances)||result.instances.length!==request.instances.length)throw new Error('Native Cut result membership changed');seen.add(result.id);let shift;
  for(let i=0;i<result.instances.length;i++){const item=result.instances[i],before=request.instances[i];if(item.id!==before.id||item.autoDrop!==before.autoDrop||item.printable!==before.printable)throw new Error('Native Cut instance identity changed');const current=finite(item.matrix,'native Cut'),original=finite(before.matrix,'Cut source'),e=current.elements;
   for(let axis=0;axis<2;axis++)if(Math.abs(e[12+axis]-original.elements[12+axis])>1e-8)throw new Error('Native Cut changed instance XY placement');
   const linear=current.clone().setPosition(0,0,0),orthogonal=linear.clone().transpose().multiply(linear);if(Math.abs(linear.determinant()-1)>1e-8||orthogonal.elements.some((v,index)=>Math.abs(v-identity().elements[index])>1e-8))throw new Error('Native Cut did not reset instance scale/mirroring');
   const dz=e[14]-original.elements[14];if(!item.autoDrop&&Math.abs(dz)>1e-8)throw new Error('Native Cut moved a no-auto-drop instance');if(item.autoDrop){if(shift!==undefined&&Math.abs(dz-shift)>1e-8)throw new Error('Native Cut grounded peers inconsistently');shift=dz;}
  }
  for(const key of ['minimumZBeforeGrounding','minimumZAfterGrounding'])if(typeof result[key]!=='number'||!Number.isFinite(result[key])||Math.abs(result[key])>1e6)throw new Error('Invalid native Cut height diagnostic');
 }
 return value;
}
export function applyNativeInstanceCut(prepared,value){
 const{request,groups,origins,result}=prepared;validateNativeInstanceCutResult(value,request);const created=[],sideIds={upper:new Set(),lower:new Set(),dowels:new Set()},sourceGroups=instanceGroups(result.created);
 for(const entry of value.results){const source=sourceGroups.get(entry.id),raw=request.results.find(item=>item.id===entry.id),family=crypto.randomUUID();
  for(let instanceIndex=0;instanceIndex<entry.instances.length;instanceIndex++){const instance=entry.instances[instanceIndex],peer=groups[instanceIndex],plateId=peer[0].plateId,isSelected=instance.id===request.selectedInstanceId,groupId=isSelected?(source[0].native?.groupId||source[0].id):crypto.randomUUID(),frame=new Matrix4().makeTranslation(...origins.get(plateId).map(v=>-v)).multiply(matrix(instance.matrix));
   source.forEach((part,index)=>{const geometry=raw.parts[index],positions=geometry.triangles.flatMap(face=>face.flatMap(vertex=>new Vector3(...geometry.vertices[vertex]).applyMatrix4(frame).toArray())),id=isSelected?part.id:crypto.randomUUID(),native={...structuredClone(part.native||{}),groupId,instanceFamily:family,instanceAutoDrop:instance.autoDrop,meshSource:{version:1,vertices:geometry.vertices.flat(),triangles:geometry.triangles.flat(),build:frame.toArray(),component:identity().toArray()}};delete native.groupTransform;
    const output={...structuredClone(part),id,plateId,positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:peer[0].visible!==false,printable:instance.printable,native};normalizeNativeMeshSource(output);created.push(output);sideIds[entry.side==='dowel'?'dowels':entry.side].add(id);
   });
  }
 }
 if(created.length>10000||created.reduce((n,o)=>n+o.positions.length/9,0)>2000000)throw new Error('Native Cut exceeds the project geometry limit');assertInstanceFamilies(created);for(const parts of instanceGroups(created).values()){const bounds=sceneBounds(parts.filter(part=>(part.native?.partType||'normal_part')==='normal_part').map(part=>({...part,visible:true})));if(prepared.bed&&bounds&&Math.max(bounds.size[0]/Math.max(1,prepared.bed.width-2),bounds.size[1]/Math.max(1,prepared.bed.depth-2))>10)throw new Error('Native Cut would open the oversized-model scaling dialog. Scale this object down before cutting linked instances.');}
 const replaceIds=groups.flatMap(parts=>parts.map(p=>p.id)),removed=new Set(replaceIds),objects=[...result.objects.filter(o=>!removed.has(o.id)&&!result.created.some(p=>p.id===o.id)),...created];
 return{...result,objects,created,replaceIds,upper:created.filter(o=>sideIds.upper.has(o.id)),lower:created.filter(o=>sideIds.lower.has(o.id)),dowels:created.filter(o=>sideIds.dowels.has(o.id)),report:{...result.report,nativeInstances:groups.length,nativeReset:true,selectedIds:created.filter(o=>o.plateId===groups.find(parts=>parts.some(part=>part.id===prepared.selectedId))[0].plateId).map(o=>o.id),selectedId:result.created.find(o=>(o.native?.partType||'normal_part')==='normal_part')?.id}};
}
