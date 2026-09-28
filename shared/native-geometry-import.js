import {validateProject} from './project.js';
import {bedBounds} from './geometry.js';
import {Matrix4,Vector3} from 'three';
import {meshPointMatrix} from './brim-ears.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';
import {addFilamentSlot,filamentSlotCount,setFilamentColor} from './filament-slots.js';
import {NATIVE_IMPORTED_FILAMENT_COLORS} from './prusa-model.js';
import {decodeFacet} from './facet-codec.js';
import {assertInstanceFamilies} from './native-instances.js';
const roleOrder=['normal_part','negative_part','modifier_part','support_blocker','support_enforcer'];
const modelPart=object=>(object.native?.partType||'normal_part')==='normal_part';
const sourceGroup=object=>JSON.stringify([object.plateId,object.native?.groupId||object.id]);
export function nativeGeometryBounds(objects){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const object of objects){const source=normalizeNativeMeshSource(object),matrix=meshPointMatrix(object);if(source)matrix.multiply(new Matrix4().fromArray(source.build)).multiply(new Matrix4().fromArray(source.component));const vertices=source?.vertices||object.positions;for(let i=0;i<vertices.length;i+=3){const point=new Vector3(vertices[i],vertices[i+1],vertices[i+2]).applyMatrix4(matrix);for(let a=0;a<3;a++){min[a]=Math.min(min[a],point.getComponent(a));max[a]=Math.max(max[a],point.getComponent(a));}}}return{min,max};}
function shift(object,delta){object.position=object.position.map((v,i)=>v+delta[i]);if(object.native?.groupTransform)object.native.groupTransform.position=object.native.groupTransform.position.map((v,i)=>v+delta[i]);}
function materialCount(objects){let count=1;const budget={nodes:0};for(const object of objects){for(const value of[object.filamentSlot,object.native?.objectSettings?.extruder,object.native?.partSettings?.extruder])if(value!==undefined){const n=Number(value);if(!Number.isInteger(n)||n<0||n>64)throw Error('Imported geometry has an invalid material slot.');count=Math.max(count,n);}for(const code of Object.values(object.painting?.color||{})){const{tree}=decodeFacet(code,{filamentCount:16,budget});const visit=node=>{if(Object.hasOwn(node,'state'))count=Math.max(count,node.state);else node.children.forEach(visit);};visit(tree);}}return count;}
function colorOnly(settings){return settings&&Object.hasOwn(settings,'extruder')?{extruder:settings.extruder}:{};}
function objectColor(settings){const result=colorOnly(settings);if(!Number(result.extruder))result.extruder='1';return result;}
/** Apply the LoadModel context to an already validated native project. Global
 * project settings are not adopted. Original indexed geometry/paint remains the
 * authority; only instance placement and document identities change. */
export function importNativeGeometry(current,source,bed,{nozzles=1,idFactory=()=>crypto.randomUUID(),centerAllParts=false}={}){
 validateProject(current);validateProject(source);if(!source.objects.length)throw Error('The project contains no geometry.');const plate=current.plates.find(p=>p.id===current.activePlateId);if(!plate||plate.locked)throw Error('The active plate is locked.');
 const used=new Set(current.objects.flatMap(o=>[o.id,o.native?.groupId,o.native?.instanceFamily].filter(Boolean)));function fresh(){let value;for(let tries=0;tries<10;tries++){value=`import-${idFactory()}`;if(typeof value==='string'&&value.length<=256&&!used.has(value)){used.add(value);return value;}}throw Error('Could not allocate distinct imported geometry identities.');}
 const groupIds=new Map(),families=new Map(),grouped=new Map(),origins=new Map(source.plates.map(p=>[p.id,p.native?.origin||[0,0,0]]));
 for(const original of source.objects){const object=structuredClone(original),key=sourceGroup(original);if(!groupIds.has(key))groupIds.set(key,fresh());object.id=fresh();object.plateId=current.activePlateId;object.visible=true;object.native={...object.native,groupId:groupIds.get(key),objectSettings:objectColor(object.native?.objectSettings),partSettings:colorOnly(object.native?.partSettings)};
  const family=original.native?.instanceFamily;if(family){if(!families.has(family))families.set(family,fresh());object.native.instanceFamily=families.get(family);}
  const origin=origins.get(original.plateId);if(!Array.isArray(origin)||origin.length!==3||origin.some(v=>!Number.isFinite(v)))throw Error('Invalid native source plate origin.');shift(object,origin);
  if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(object);
 }
 const groups=[...grouped.values()];for(const parts of groups){if(parts.some(p=>!roleOrder.includes(p.native.partType||'normal_part')))throw Error('Unsupported native imported part type.');if(!parts.some(modelPart))throw Error('Imported native object has no normal part.');parts.sort((a,b)=>roleOrder.indexOf(a.native.partType||'normal_part')-roleOrder.indexOf(b.native.partType||'normal_part'));}
 const objects=groups.flat(),familyGroups=new Map();for(const parts of groups){const key=parts[0].native.instanceFamily||parts[0].native.groupId;if(!familyGroups.has(key))familyGroups.set(key,[]);familyGroups.get(key).push(parts);}
 // Native ModelObject::min_z uses its first instance; ensure_on_bed applies
 // that displacement to auto-drop instances while retaining their offsets.
 function ensureOnBed(){for(const instances of familyGroups.values()){const box=nativeGeometryBounds(instances[0].filter(modelPart));const dz=-box.min[2];for(const parts of instances)if(parts[0].native.instanceAutoDrop!==false)for(const part of parts)shift(part,[0,0,dz]);}}
 ensureOnBed();const box=nativeGeometryBounds(centerAllParts?objects:objects.filter(modelPart)),target=bedBounds(bed),delta=[(target.min[0]+target.max[0]-box.min[0]-box.max[0])/2,(target.min[1]+target.max[1]-box.min[1]-box.max[1])/2,0];if(Math.abs(delta[0])>=1e-4||Math.abs(delta[1])>=1e-4)for(const object of objects)shift(object,delta);ensureOnBed();
 let next=current,colorIndex=0;const required=materialCount(objects);while(filamentSlotCount(next)<required){next=addFilamentSlot(next,{nozzles});next=setFilamentColor(next,filamentSlotCount(next)-1,NATIVE_IMPORTED_FILAMENT_COLORS[colorIndex++%NATIVE_IMPORTED_FILAMENT_COLORS.length]);}
 if(next.objects.length+objects.length>10000||[...next.objects,...objects].reduce((sum,o)=>sum+o.positions.length/9,0)>2000000)throw Error('Imported geometry exceeds the project limits.');
 const result={...next,nativeWorkflow:true,objects:[...next.objects,...objects],selectedId:objects[0].id,selectedIds:groups.map(parts=>parts[0].id),selectionScope:'object',selectionFrame:null};validateProject(result);assertInstanceFamilies(result.objects);return result;
}
