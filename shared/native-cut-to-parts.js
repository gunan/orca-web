import {Matrix4,Vector3,Quaternion} from 'three';
import {nativeObjectModel,nativeObjectFrame} from './native-clipboard.js';
import {linkedCutGroups,validateNativeInstanceCutResult,INSTANCE_CUT_REVISION} from './native-instance-cut.js';
import {assertInstanceFamilies,instanceGroups,instanceGroupKey,normalizeInstanceAutoDrop} from './native-instances.js';
import {nativePlateOrigin} from './native-project.js';
import {bedBounds,sceneBounds} from './geometry.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';
import {invalidateNativeEmboss,bakeNativeEmbossMetadata} from './native-emboss.js';
import {cutInformationForParts,normalizeCutId} from './cut-metadata.js';
export const CUT_PARTS_LIMITS=Object.freeze({inputBytes:64*1024*1024,outputBytes:64*1024*1024,sourceTriangles:500000,resultTriangles:1000000,expandedTriangles:2000000});
const m=value=>new Matrix4().fromArray(value),normal=part=>(part.native?.partType||'normal_part')==='normal_part';
function finiteMatrix(value){if(!Array.isArray(value)||value.length!==16||value.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e6)||[3,7,11].some(i=>value[i]!==0)||value[15]!==1||Math.abs(m(value).determinant())<1e-12)throw new Error('Invalid native Cut geometry frame');return m(value);}
export function prepareNativeCutToParts({objects,plates,selectedId,bed},options={}){
 assertInstanceFamilies(objects);if(options.connectors?.length||options.mode&&options.mode!=='planar'||options.keep&&options.keep!=='both'||[options.upper?.placeOnCut,options.upper?.flip,options.lower?.placeOnCut,options.lower?.flip].some(Boolean))throw new Error('Cut to parts requires both planar sides, no new connectors, and cleared placement/flip flags');
 const groups=linkedCutGroups(objects,selectedId),selected=groups.find(parts=>parts.some(part=>part.id===selectedId));if(!selected?.some(normal))throw new Error('Select a normal object to cut');if(groups.length>256)throw new Error('Cut supports at most 256 linked instances');
 const b=bedBounds(bed),plateBed={width:b.size[0],depth:b.size[1],height:b.size[2]},origins=new Map(plates.map((p,i)=>[p.id,nativePlateOrigin(i,plates.length,plateBed)]));
 const instances=groups.map(parts=>{const origin=origins.get(parts[0].plateId);if(!origin)throw new Error('Cut instance plate is missing');return{id:instanceGroupKey(parts[0]),matrix:nativeObjectFrame(parts,origin).toArray(),autoDrop:normalizeInstanceAutoDrop(parts[0].native?.instanceAutoDrop),printable:parts[0].printable!==false};});
 const direction=options.normal||[0,0,1],offset=options.offset;if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite)||Math.hypot(...direction)<1e-12||typeof offset!=='number'||!Number.isFinite(offset))throw new Error('Enter a valid cut plane');const n=new Vector3(...direction).normalize(),bounds=sceneBounds(selected.filter(normal).map(o=>({...o,visible:true}))),point=new Vector3(...bounds.center);point.addScaledVector(n,offset-n.dot(point));
 const model=nativeObjectModel(selected),selectedFrame=m(model.matrix),cutMatrix=new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,0,1),n)).setPosition(point.sub(new Vector3().setFromMatrixPosition(selectedFrame))).toArray();
 const sourceParts=model.parts.map((part,i)=>({...part,id:selected[i].id,name:selected[i].name})),triangles=sourceParts.reduce((sum,p)=>sum+p.triangles.length,0),vertices=sourceParts.reduce((sum,p)=>sum+p.vertices.length,0);
 if(triangles>CUT_PARTS_LIMITS.sourceTriangles||vertices>500000||triangles*instances.length>CUT_PARTS_LIMITS.expandedTriangles)throw new Error('Cut input exceeds the source or expanded geometry limit');
 const request={format:'orca-cut-to-parts-request',version:1,sourceRevision:INSTANCE_CUT_REVISION,operation:'cut-to-parts',selectedInstanceId:instanceGroupKey(selected[0]),instances,sourceParts,cutMatrix};
 if(new TextEncoder().encode(JSON.stringify(request)).length>CUT_PARTS_LIMITS.inputBytes)throw new Error('Cut request exceeds 64 MiB');return{request,objects,groups,selected,origins,bed:plateBed,normal:n.toArray(),offset};
}
export function validateNativeCutToPartsResult(value,request){
 if(value?.format!=='orca-native-cut-to-parts'||value.version!==1||value.sourceRevision!==INSTANCE_CUT_REVISION||value.selectedInstanceId!==request.selectedInstanceId||!Array.isArray(value.parts)||!value.parts.length||value.parts.length>8192||value.parts.length*request.instances.length>10000)throw new Error('Invalid native Cut to parts result identity');
 // Reuse the exact instance/reset safety checks, without a second geometry algorithm.
 validateNativeInstanceCutResult({format:'orca-native-instance-cut',version:1,sourceRevision:value.sourceRevision,selectedInstanceId:value.selectedInstanceId,results:[{id:'combined',side:'upper',instances:value.instances,minimumZBeforeGrounding:value.minimumZBeforeGrounding,minimumZAfterGrounding:value.minimumZAfterGrounding}]},{...request,results:[{id:'combined',side:'upper'}]});
 const source=new Map(request.sourceParts.map((part,i)=>[part.id,{part,index:i}])),seen=new Set();let previous=-1,triangles=0,vertices=0,normalCount=0;
 for(const part of value.parts){const input=source.get(part.sourceId);if(!input||input.index<previous||part.type!==input.part.type||typeof part.fromUpper!=='boolean')throw new Error('Native Cut changed part membership/order');previous=input.index;const solid=part.type==='normal_part',side=solid?(part.fromUpper?'upper':'lower'):'modifier',tag=`${part.sourceId}:${side}`;if(seen.has(tag)||part.name!==input.part.name+(solid?(part.fromUpper?'_A':'_B'):''))throw new Error('Native Cut changed part name/side');if(solid&&part.fromUpper&&seen.has(`${part.sourceId}:lower`))throw new Error('Native Cut reversed A/B order');seen.add(tag);normalCount+=solid;
  finiteMatrix(part.matrix);if(!Array.isArray(part.vertices)||!Array.isArray(part.triangles)||!part.vertices.length||!part.triangles.length||(vertices+=part.vertices.length)>1000000||(triangles+=part.triangles.length)>CUT_PARTS_LIMITS.resultTriangles||triangles*request.instances.length>CUT_PARTS_LIMITS.expandedTriangles)throw new Error('Native Cut output exceeds geometry bounds');
  for(const point of part.vertices)if(!Array.isArray(point)||point.length!==3||!point.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e6))throw new Error('Invalid native Cut vertex');for(const face of part.triangles)if(!Array.isArray(face)||face.length!==3||!face.every(v=>Number.isInteger(v)&&v>=0&&v<part.vertices.length))throw new Error('Invalid native Cut triangle');
 }
 if(!normalCount||request.sourceParts.some(part=>part.type!=='normal_part'&&!seen.has(`${part.id}:modifier`)))throw new Error('Native Cut omitted a required part');return value;
}
export function applyNativeCutToParts(prepared,value){
 validateNativeCutToPartsResult(value,prepared.request);const{groups,selected,origins,objects,request}=prepared,created=[],upper=[],lower=[],source=new Map(selected.map(p=>[p.id,p])),family=crypto.randomUUID(),existing=cutInformationForParts(selected)?.cutId,cutId=existing?normalizeCutId({...existing,checkSum:(BigInt(existing.checkSum)+1n).toString()}):null;
 const sourceFrame=nativeObjectFrame(selected),sourceLinear=sourceFrame.clone().setPosition(0,0,0),selectedPlate=selected[0].plateId;
 for(let index=0;index<value.instances.length;index++){
  const instance=value.instances[index],peer=groups[index],plateId=peer[0].plateId,build=new Matrix4().makeTranslation(...origins.get(plateId).map(v=>-v)).multiply(m(instance.matrix)),groupId=crypto.randomUUID(),delta=build.clone().multiply(sourceLinear).multiply(sourceFrame.clone().invert());
  for(const part of value.parts){const template=source.get(part.sourceId),solid=normal(template),id=crypto.randomUUID(),native={...structuredClone(template.native||{}),groupId,objectName:template.native?.objectName||selected.find(normal).name,partType:part.type,instanceFamily:family,instanceAutoDrop:instance.autoDrop};delete native.groupTransform;delete native.meshSource;
   if(solid)Object.assign(native,invalidateNativeEmboss(native));else Object.assign(native,bakeNativeEmbossMetadata(template,{worldMatrix:delta}));
   if(solid){delete native.textConfiguration;delete native.embossShape;}if(cutId)native.cutId={...cutId};
   // Native cut_mesh can retain unused indexed vertices; trim only unused IDs for
   // the web precision carrier, retaining every used Float32 vertex and face.
   const used=[...new Set(part.triangles.flat())].sort((a,b)=>a-b),indices=new Map(used.map((id,i)=>[id,i])),vertices=used.flatMap(i=>part.vertices[i]),faces=part.triangles.flat().map(i=>indices.get(i)),component=m(part.matrix),combined=build.clone().multiply(component),winding=combined.determinant()<0?[0,2,1]:[0,1,2],positions=[];
   for(const face of part.triangles)for(const corner of winding)positions.push(...new Vector3(...part.vertices[face[corner]]).applyMatrix4(combined).toArray());native.meshSource={version:1,vertices,triangles:faces,build:build.toArray(),component:part.matrix};
   const result={...structuredClone(template),id,name:part.name,plateId,positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:peer[0].visible!==false,printable:instance.printable,native};for(const key of ['painting','text','brimEars','assemblyParts'])delete result[key];normalizeNativeMeshSource(result);created.push(result);(part.fromUpper?upper:lower).push(result);
  }
 }
 assertInstanceFamilies(created);for(const parts of instanceGroups(created).values()){const bounds=sceneBounds(parts.filter(normal).map(p=>({...p,visible:true})));if(bounds&&Math.max(bounds.size[0]/Math.max(1,prepared.bed.width-2),bounds.size[1]/Math.max(1,prepared.bed.depth-2))>10)throw new Error('Native Cut would open the oversized-model scaling dialog. Scale this object down before cutting.');}
 const replaceIds=groups.flatMap(parts=>parts.map(p=>p.id)),removed=new Set(replaceIds),remaining=objects.filter(o=>!removed.has(o.id)).map(o=>cutId&&o.native?.cutId?.id===cutId.id?{...o,native:{...o.native,cutId:{...cutId}}}:o);if(remaining.length+created.length>10000||[...remaining,...created].reduce((n,p)=>n+p.positions.length/9,0)>2000000)throw new Error('Cut exceeds the project geometry limit');
 const selectedIds=created.filter(o=>o.plateId===selectedPlate).map(o=>o.id),selectedId=created.find(o=>o.plateId===selectedPlate&&normal(o))?.id;
 return{objects:[...remaining,...created],created,replaceIds,upper,lower,dowels:[],report:{keepAsParts:true,nativeKernel:true,nativeReset:true,nativeInstances:groups.length,normal:prepared.normal,offset:prepared.offset,discarded:[],connectors:0,dowels:0,resetLayerProfiles:0,selectedIds,selectedId,...(cutId&&{cutFamilyUpdate:cutId}),origins:value.parts.map(p=>({sourceId:p.sourceId,side:p.type==='normal_part'?(p.fromUpper?'upper':'lower'):'modifier'}))}};
}
