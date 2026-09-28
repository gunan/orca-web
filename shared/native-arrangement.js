import {Matrix4,Quaternion,Euler,Vector3} from 'three';
import {meshPointMatrix} from './brim-ears.js';
import {nativeMeshSourceGroup} from './native-mesh-source.js';
import {sourceBounds} from './geometry.js';

export const ARRANGE_REVISION='8500fcdccaa10b5099ac20d252af3a7c560046f1';
export const ARRANGE_LIMITS=Object.freeze({objects:256,triangles:500000,inputBytes:64*1024*1024,outputBytes:2*1024*1024,plates:36});
export const ARRANGE_DEFAULTS=Object.freeze({spacing:0,rotation:false,multipleMaterials:true,alignY:false,avoidCalibration:false,scope:'plate'});
const settingKeys=new Set(['printable_area','printable_height','bed_exclude_area','wrapping_exclude_area','nozzle_diameter','nozzle_height','extruder_clearance_radius','extruder_clearance_height_to_lid','extruder_clearance_height_to_rod','best_object_pos','skirt_loops','skirt_distance','skirt_type','skirt_height','draft_shield','initial_layer_line_width','initial_layer_print_height','line_width','max_layer_height','enable_support','support_type','support_filament','support_interface_filament','filament_type','curr_bed_type','nozzle_temperature','nozzle_temperature_initial_layer','temperature_vitrification','printer_structure','print_sequence','enable_prime_tower','timelapse_type','enable_wrapping_detection','scan_first_layer','layer_height','prime_tower_width','prime_volume','prime_tower_brim_width','prime_tower_infill_gap','wipe_tower_wall_type','wipe_tower_rib_width','wipe_tower_extra_rib_length','filament_change_length','filament_diameter','wipe_tower_x','wipe_tower_y','wipe_tower_rotation_angle']);
export function normalizeArrangeOptions(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(ARRANGE_DEFAULTS,k)))throw new Error('Invalid arrangement options');
 const o={...ARRANGE_DEFAULTS,...value};if(typeof o.spacing!=='number'||!Number.isFinite(o.spacing)||o.spacing<0||o.spacing>100)throw new Error('Arrangement spacing must be from 0 to 100 mm');
 for(const k of ['rotation','multipleMaterials','alignY','avoidCalibration'])if(typeof o[k]!=='boolean')throw new Error(`Invalid arrangement ${k}`);
 if(!['plate','selection'].includes(o.scope))throw new Error('Choose plate or selected-object arrangement');
 return{...o,alignY:o.rotation?false:o.alignY};
}
const identity=()=>new Matrix4().toArray();
const rows=(values,n)=>Array.from({length:values.length/n},(_,i)=>values.slice(i*n,i*n+n));
function indexed(object){const vertices=[],triangles=[],lookup=new Map();for(let i=0;i<object.positions.length;i+=9){const face=[];for(let j=0;j<9;j+=3){const point=object.positions.slice(i+j,i+j+3),key=point.join(',');if(!lookup.has(key)){lookup.set(key,vertices.length);vertices.push(point);}face.push(lookup.get(key));}triangles.push(face);}return{vertices,triangles};}
function commonFrame(members){const frame=members[0].native?.groupTransform;if(!frame||members.some(p=>JSON.stringify(p.native?.groupTransform)!==JSON.stringify(frame)))return new Matrix4();return new Matrix4().makeTranslation(...frame.pivot.map((v,i)=>v+frame.position[i])).multiply(new Matrix4().makeRotationFromEuler(new Euler(...frame.rotation.map(v=>v*Math.PI/180),'XYZ'))).multiply(new Matrix4().makeScale(...frame.scale)).multiply(new Matrix4().makeTranslation(...frame.pivot.map(v=>-v)));}
export function prepareNativeArrangement(project,settings,value={}){
 const options=normalizeArrangeOptions(value),plate=project.plates.find(p=>p.id===project.activePlateId);if(!plate)throw new Error('Arrangement plate is missing');if(plate.locked)throw new Error('The active plate is locked');
 const groups=new Map();for(const o of project.objects){if(o.plateId!==plate.id||o.visible===false)continue;const key=o.native?.groupId||o.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}
 if(!groups.size||groups.size>ARRANGE_LIMITS.objects)throw new Error(`Arrange needs 1–${ARRANGE_LIMITS.objects} objects`);
 if([...groups.values()].flat().reduce((n,o)=>n+o.positions.length/9,0)>ARRANGE_LIMITS.triangles)throw new Error('Arrangement triangle limit exceeded');
 const selected=new Set(project.selectedIds?.length?project.selectedIds:[project.selectedId].filter(Boolean));let selectedGroups=0;
 const objects=[...groups].map(([id,parts])=>{
  if(!parts.some(p=>(p.native?.partType||'normal_part')==='normal_part'))throw new Error('Arrangement requires a normal part in each group');
  const precise=nativeMeshSourceGroup(parts,[0,0,0]),matrix=precise?.build||commonFrame(parts),inverse=matrix.clone().invert(),isSelected=options.scope==='plate'||parts.some(p=>selected.has(p.id));if(isSelected)selectedGroups++;
  return{id,selected:isSelected,printable:parts[0].printable!==false,matrix:matrix.toArray(),settings:{...(parts[0].native?.objectSettings||{}),extruder:String(parts.length===1?parts[0].filamentSlot||parts[0].native?.objectSettings?.extruder||1:parts[0].native?.objectSettings?.extruder||parts[0].filamentSlot||1)},parts:parts.map((part,index)=>{
   const source=precise?.sources[index];return{id:part.id,type:part.native?.partType||'normal_part',...(source?{vertices:rows(source.vertices,3),triangles:rows(source.triangles,3),matrix:source.component}:{...indexed(part),matrix:inverse.clone().multiply(meshPointMatrix(part)).toArray()}),settings:{...(part.native?.partSettings||{}),extruder:String(part.filamentSlot||part.native?.partSettings?.extruder||part.native?.objectSettings?.extruder||1)},color:part.painting?.color||{}};
  })};
 });
 if(!selectedGroups)throw new Error('Select one or more objects to arrange');
 const nativeSettings=Object.fromEntries(Object.entries(settings).filter(([k])=>settingKeys.has(k)||/^(?:cool|eng|hot|textured|supertack)_plate_temp(?:_initial_layer)?$/.test(k)));
 const sequence=plate.native?.metadata?.print_sequence??settings.print_sequence;
 return{format:'orca-arrangement-request',version:1,sourceRevision:ARRANGE_REVISION,settings:nativeSettings,options:{...options,sequential:sequence==='by object'||sequence==='1'},objects};
}
function finiteMatrix(value){if(!Array.isArray(value)||value.length!==16||value.some(v=>!Number.isFinite(v)||Math.abs(v)>1e8)||[3,7,11].some(i=>value[i]!==0)||value[15]!==1)throw new Error('Invalid native arrangement transform');const m=new Matrix4().fromArray(value);if(Math.abs(m.determinant())<1e-12)throw new Error('Singular native arrangement transform');return m;}
export function validateArrangementResult(value,request){
 if(!value||value.format!=='orca-native-arrangement'||value.version!==1||value.sourceRevision!==ARRANGE_REVISION||!Array.isArray(value.objects))throw new Error('Invalid native arrangement result');
 const wanted=new Map(request.objects.filter(o=>o.selected).map(o=>[o.id,o]));if(value.objects.length!==wanted.size)throw new Error('Native arrangement object count changed');
 const seen=new Set();for(const item of value.objects){if(!wanted.has(item.id)||seen.has(item.id)||!Number.isInteger(item.bedIndex)||item.bedIndex<0||item.bedIndex>=ARRANGE_LIMITS.plates)throw new Error('Native arrangement could not fit all requested objects');seen.add(item.id);finiteMatrix(item.matrix);}
 return value;
}
/** Apply only rigid placement deltas to original source meshes and metadata. */
export function applyNativeArrangement(project,request,value){
 validateArrangementResult(value,request);const sources=new Map(request.objects.map(o=>[o.id,o])),changes=new Map(value.objects.map(o=>[o.id,o])),plates=[...project.plates],plateIds=new Map([[0,project.activePlateId]]),active=plates.find(p=>p.id===project.activePlateId);
 const max=Math.max(...value.objects.map(o=>o.bedIndex));if(plates.length+max>ARRANGE_LIMITS.plates)throw new Error('Arrangement exceeds the 36-plate limit');
 for(let i=1;i<=max;i++){const id=crypto.randomUUID();plateIds.set(i,id);plates.push({id,name:`Plate ${plates.length+1}`,locked:false,...(active.native?.metadata&&{native:{metadata:structuredClone(active.native.metadata)}})});}
 const deltas=new Map();for(const[id,item]of changes){const delta=finiteMatrix(item.matrix).multiply(finiteMatrix(sources.get(id).matrix).invert()),p=new Vector3(),q=new Quaternion(),s=new Vector3();delta.decompose(p,q,s);if(Math.max(Math.abs(s.x-1),Math.abs(s.y-1),Math.abs(s.z-1))>1e-7||Math.abs(p.z)>1e-6||Math.abs(delta.elements[2])+Math.abs(delta.elements[6])+Math.abs(delta.elements[8])+Math.abs(delta.elements[9])>1e-7)throw new Error('Native arrangement changed more than XY placement and Z rotation');deltas.set(id,delta);}
 const objects=project.objects.map(o=>{if(o.plateId!==project.activePlateId)return o;const id=o.native?.groupId||o.id,result=changes.get(id);if(!result)return o;const delta=deltas.get(id),m=delta.clone().multiply(meshPointMatrix(o)),p=new Vector3(),q=new Quaternion(),s=new Vector3();m.decompose(p,q,s);const e=new Euler().setFromQuaternion(q,'XYZ'),center=sourceBounds(o).center,worldCenter=new Vector3(...center).applyMatrix4(m),native=o.native?{...o.native}:undefined;
 if(native?.groupTransform){const frame=structuredClone(native.groupTransform),position=new Vector3(...frame.pivot.map((v,i)=>v+frame.position[i])).applyMatrix4(delta),rotation=new Quaternion().setFromRotationMatrix(delta).multiply(new Quaternion().setFromEuler(new Euler(...frame.rotation.map(v=>v*Math.PI/180),'XYZ'))),angles=new Euler().setFromQuaternion(rotation,'XYZ');frame.position=position.toArray().map((v,i)=>v-frame.pivot[i]);frame.rotation=[angles.x,angles.y,angles.z].map(v=>v*180/Math.PI);native.groupTransform=frame;}
 return{...o,position:worldCenter.toArray().map((v,i)=>v-center[i]),rotation:[e.x,e.y,e.z].map(v=>v*180/Math.PI),scale:s.toArray(),plateId:plateIds.get(result.bedIndex),...(native&&{native})};});
 const selectedIds=(project.selectedIds?.length?project.selectedIds:[project.selectedId].filter(Boolean)).filter(id=>objects.some(o=>o.id===id&&o.plateId===project.activePlateId));return{...project,objects,plates,selectedIds,selectedId:selectedIds[0]||null,selectionFrame:null};
}
