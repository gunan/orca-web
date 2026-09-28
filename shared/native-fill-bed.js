import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {prepareNativePrimeTower} from './native-prime-tower.js';
import {ARRANGE_REVISION,ARRANGE_LIMITS,prepareNativeArrangement,normalizeArrangeOptions} from './native-arrangement.js';
import {nativeBed,nativePlateOrigin} from './native-project.js';
import {instanceGroups,instanceGroupKey,instanceFamily,assertInstanceFamilies} from './native-instances.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';
import {meshPointMatrix} from './brim-ears.js';
import {sourceBounds} from './geometry.js';
export const FILL_LIMITS=Object.freeze({instances:256,candidates:4096,triangles:500000,inputBytes:64*1024*1024});
function matrix(value){if(!Array.isArray(value)||value.length!==16||value.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7)||[3,7,11].some(i=>value[i]!==0)||value[15]!==1)throw new Error('Invalid native Fill transform');const m=new Matrix4().fromArray(value);if(Math.abs(m.determinant())<1e-12)throw new Error('Singular native Fill transform');return m;}
export function prepareNativeFillBed(project,settings,options={},context={}){
 if(project.calibration||project.generatedPatternBinding)throw new Error('Generated calibration paths cannot be filled. Regenerate the required calibration layout.');
 if(typeof context.isBblPrinter!=='boolean')throw new Error('Native printer vendor context is required for Fill. Select a known native printer preset.');
 const groups=instanceGroups(project.objects),selected=new Set(project.selectedIds?.length?project.selectedIds:[project.selectedId].filter(Boolean)),chosen=[...groups].filter(([,parts])=>parts.some(p=>selected.has(p.id)));
 if(!chosen.length)throw new Error('Select one printable object to Fill');
 const identities=new Set(chosen.map(([key,parts])=>instanceFamily(parts)||key));if(identities.size!==1)throw new Error('Fill requires instances of one native object');
 const selectedGroup=chosen.find(([,parts])=>parts.some(p=>p.id===project.selectedId))||chosen[0],plateId=selectedGroup[1][0].plateId,plateIndex=project.plates.findIndex(p=>p.id===plateId);
 if(project.plates[plateIndex]?.locked)throw new Error('The selected plate is locked');
 assertInstanceFamilies(project.objects);const bed=nativeBed(settings);if(!bed)throw new Error('Native printable area is missing');
 const origins=new Map(project.plates.map((p,i)=>[p.id,nativePlateOrigin(i,project.plates.length,bed)])),models=new Map();let first;
 for(const plate of project.plates){
  const objects=project.objects.filter(o=>o.plateId===plate.id);if(!objects.length)continue;
  // Visibility is a display preference; native Fill traverses the whole Model.
  const request=prepareNativeArrangement({...project,activePlateId:plate.id,plates:project.plates.map(p=>({...p,locked:false})),objects:objects.map(o=>({...o,visible:true}))},settings,{...normalizeArrangeOptions(options),scope:'plate'});first||=request;
  for(const object of request.objects){const parts=objects.filter(o=>(o.native?.groupId||o.id)===object.id),groupKey=instanceGroupKey(parts[0]),family=instanceFamily(parts),id=family||groupKey,world=new Matrix4().makeTranslation(...origins.get(plate.id)).multiply(matrix(object.matrix));
   if(!models.has(id))models.set(id,{...object,id,selected:true,triangleCount:object.parts.reduce((n,p)=>n+p.triangles.length,0),instances:[]});models.get(id).instances.push({id:groupKey,matrix:world.toArray(),printable:object.printable,plateId:plate.id});
  }
 }
 if([...groups].length>FILL_LIMITS.instances)throw new Error('Native Fill supports at most 256 existing instances');
 const sequence=project.plates[plateIndex].native?.metadata?.print_sequence??settings.print_sequence;
 const request={...first,format:'orca-fill-bed-request',operation:'fill-bed',mode:'instances',settings:{...first.settings,...(settings.extruder_printable_area?.length&&{extruder_printable_area:settings.extruder_printable_area})},options:{...first.options,sequential:sequence==='by object'||sequence==='1'},objects:[...models.values()],selectedObjectId:[...identities][0],selectedInstanceId:selectedGroup[0],isBbl:context.isBblPrinter,plate:{index:plateIndex,count:project.plates.length,columns:Math.ceil(Math.sqrt(project.plates.length)),origin:origins.get(plateId).slice(0,2)}};
 // The server supplies resolved values. The worker computes its own tower from
 // the same complete project; a client-supplied footprint never reaches packing.
 if([true,1,'1'].includes(settings.enable_prime_tower))request.towerPreview=prepareNativePrimeTower({...project,activePlateId:plateId},settings);
 if(request.objects.reduce((n,o)=>n+o.parts.reduce((m,p)=>m+p.triangles.length,0),0)>FILL_LIMITS.triangles)throw new Error('Native Fill exceeds the 500000-triangle input limit');
 if(new TextEncoder().encode(JSON.stringify(request)).length>FILL_LIMITS.inputBytes)throw new Error('Native Fill request exceeds 64 MiB');return request;
}
export function validateNativeFillBedResult(result,request){
 if(result?.format!=='orca-native-fill-bed'||result.version!==1||result.sourceRevision!==ARRANGE_REVISION||result.selectedObjectId!==request.selectedObjectId||result.selectedInstanceId!==request.selectedInstanceId)throw new Error('Invalid native Fill result');
 const source=request.objects.find(o=>o.id===request.selectedObjectId),total=request.objects.reduce((n,o)=>n+o.instances.length,0);if(!source||!Number.isInteger(result.added)||result.added<0||total+result.added>FILL_LIMITS.instances||!Array.isArray(result.instances)||result.instances.length!==source.instances.length+result.added||result.requiresArrange!==(result.added>0))throw new Error('Native Fill instance count changed unexpectedly');
 const triangleCount=o=>o.parts?.reduce((n,p)=>n+p.triangles.length,0)??o.triangleCount;if(request.objects.every(o=>Number.isInteger(triangleCount(o)))&&request.objects.reduce((n,o)=>n+triangleCount(o)*o.instances.length,0)+result.added*triangleCount(source)>2000000)throw new Error('Native Fill exceeds the two million triangle project limit');
 const sourceIds=new Map(source.instances.map(i=>[i.id,i]));
 for(let index=0;index<result.instances.length;index++){const item=result.instances[index];if(item.index!==index||item.id!==(index<source.instances.length?source.instances[index].id:null)||!sourceIds.has(item.sourceInstanceId)||typeof item.printable!=='boolean')throw new Error('Invalid native Fill instance identity');matrix(item.matrix);const original=index<source.instances.length?source.instances[index]:sourceIds.get(item.sourceInstanceId),old=matrix(original.matrix),next=matrix(item.matrix);const delta=next.clone().multiply(old.clone().invert());if(Math.abs(delta.elements[14])>1e-6||Math.abs(delta.elements[2])+Math.abs(delta.elements[6])+Math.abs(delta.elements[8])+Math.abs(delta.elements[9])>1e-6||Math.abs(delta.determinant()-1)>1e-6||Math.abs(delta.elements[0]**2+delta.elements[1]**2-1)>1e-6||Math.abs(delta.elements[4]**2+delta.elements[5]**2-1)>1e-6||Math.abs(delta.elements[0]*delta.elements[4]+delta.elements[1]*delta.elements[5])>1e-6)throw new Error('Native Fill changed more than XY placement and Z rotation');if(result.added===0&&item.matrix.some((v,i)=>Math.abs(v-original.matrix[i])>1e-9))throw new Error('Native Fill changed an object without adding an instance');}
 return result;
}
function place(part,delta,native){const pose=delta.clone().multiply(meshPointMatrix(part)),position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();pose.decompose(position,rotation,scale);const angles=new Euler().setFromQuaternion(rotation,'XYZ'),center=sourceBounds(part).center,worldCenter=new Vector3(...center).applyMatrix4(pose);if(native.groupTransform){const frame=structuredClone(native.groupTransform),p=new Vector3(...frame.pivot.map((v,i)=>v+frame.position[i])).applyMatrix4(delta),q=new Quaternion().setFromRotationMatrix(delta).multiply(new Quaternion().setFromEuler(new Euler(...frame.rotation.map(v=>v*Math.PI/180),'XYZ'))),e=new Euler().setFromQuaternion(q,'XYZ');frame.position=p.toArray().map((v,i)=>v-frame.pivot[i]);frame.rotation=[e.x,e.y,e.z].map(v=>v*180/Math.PI);native.groupTransform=frame;}return{...part,position:worldCenter.toArray().map((v,i)=>v-center[i]),rotation:[angles.x,angles.y,angles.z].map(v=>v*180/Math.PI),scale:scale.toArray(),native};}
export function applyNativeFillBed(project,request,result){
 validateNativeFillBedResult(result,request);if(!result.added)return project;const input=request.objects.find(o=>o.id===request.selectedObjectId);if(project.objects.reduce((n,o)=>n+o.positions.length/9,0)+result.added*input.parts.reduce((n,p)=>n+p.triangles.length,0)>2000000)throw new Error('Fill exceeds the two million triangle project limit');
 const groups=instanceGroups(project.objects),source=request.objects.find(o=>o.id===request.selectedObjectId),family=instanceFamily(groups.get(source.instances[0].id))||crypto.randomUUID(),bed=nativeBed(project.nativeSettings||request.settings),origins=new Map(project.plates.map((p,i)=>[p.id,nativePlateOrigin(i,project.plates.length,bed)])),active=project.plates[request.plate.index],replacements=new Map(),added=[];
 for(const item of result.instances){const original=source.instances.find(i=>i.id===(item.id||item.sourceInstanceId)),parts=groups.get(original.id);if(!parts)throw new Error('Native Fill source instance no longer exists');const sourceOrigin=origins.get(parts[0].plateId),targetOrigin=origins.get(active.id),delta=new Matrix4().makeTranslation(...targetOrigin.map(v=>-v)).multiply(matrix(item.matrix)).multiply(matrix(original.matrix).invert()).multiply(new Matrix4().makeTranslation(...sourceOrigin)),groupId=item.id?(parts[0].native?.groupId||parts[0].id):crypto.randomUUID();
  const transformed=parts.map((part,index)=>{const native={...structuredClone(part.native||{}),groupId,instanceFamily:family};if(!native.meshSource){const modelPart=source.parts[index],build=meshPointMatrix(part).invert().multiply(new Matrix4().makeTranslation(...sourceOrigin.map(v=>-v))).multiply(matrix(original.matrix));native.meshSource=normalizeNativeMeshSource({...part,native:{...native,meshSource:{version:1,vertices:modelPart.vertices.flat(),triangles:modelPart.triangles.flat(),build:build.toArray(),component:modelPart.matrix}}});}const moved=place(structuredClone(part),delta,native);return{...moved,...(!item.id&&{id:crypto.randomUUID()}),plateId:active.id,printable:item.printable};});
  if(item.id)parts.forEach((part,index)=>replacements.set(part.id,transformed[index]));else added.push(...transformed);
 }
 const objects=[...project.objects.map(o=>replacements.get(o.id)||o),...added];if(objects.length>10000||objects.reduce((n,o)=>n+o.positions.length/9,0)>2000000)throw new Error('Fill exceeds the project geometry limit');
 return{...project,activePlateId:active.id,objects,selectionFrame:null};
}
