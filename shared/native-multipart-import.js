import {Matrix4,Vector3} from 'three';
import {validateProject} from './project.js';
import {instanceGroups,assertInstanceFamilies} from './native-instances.js';
import {nativeGeometryBounds} from './native-geometry-import.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';
import {meshPointMatrix} from './brim-ears.js';
import {bakeNativeEmbossMetadata} from './native-emboss.js';
function modelObjects(project){const families=new Map();for(const parts of instanceGroups(project.objects).values()){const key=parts[0].native?.instanceFamily||JSON.stringify([parts[0].plateId,parts[0].native?.groupId||parts[0].id]);if(!families.has(key))families.set(key,[]);families.get(key).push(parts);}return[...families.values()];}
function originOf(project,object){const origin=project.plates.find(p=>p.id===object.plateId)?.native?.origin||[0,0,0];if(!Array.isArray(origin)||origin.length!==3||!origin.every(Number.isFinite))throw Error('Invalid native source plate origin.');return origin;}
// This early return order is intentional: the original source accepts the
// first differing height before looking at any later object.
export function nativeMultipartDetected(objects){if(objects.length<=1)return false;let minZ;for(const object of objects){if(object.volumeCount>1||object.configKeys>1)return false;if(minZ===undefined)minZ=object.minZ;else if(Math.abs(minZ-object.minZ)>1e-4)return true;}return false;}
export function geometryMultipartDescriptor(project){validateProject(project);return modelObjects(project).map(instances=>{const parts=instances[0],normal=parts.filter(o=>(o.native?.partType||'normal_part')==='normal_part');return{volumeCount:parts.length,configKeys:Object.hasOwn(parts[0].native?.objectSettings||{},'extruder')?1:0,minZ:normal.length?nativeGeometryBounds(normal).min[2]+originOf(project,parts[0])[2]:Infinity};});}
export function needsNativeMultipartChoice(project){return nativeMultipartDetected(geometryMultipartDescriptor(project));}
/** Native convert_multipart_object builds a new ModelObject from volume copies,
 * placing each source instance in a common frame. Object-level state is reset. */
export function mergeNativeMultipartGeometry(project,{name='Multipart object'}={}){
 validateProject(project);assertInstanceFamilies(project.objects);const models=modelObjects(project);if(models.length<2)throw Error('Multipart conversion needs at least two native objects.');const objects=[];let id=0;
 for(const instances of models){for(let p=0;p<instances[0].length;p++)for(const parts of instances){const original=parts[p],source=normalizeNativeMeshSource(original),world=new Matrix4().makeTranslation(...originOf(project,original)),matrix=world.clone().multiply(meshPointMatrix(original));let vertices,triangles,component;
  if(source){vertices=source.vertices;triangles=source.triangles;component=matrix.clone().multiply(new Matrix4().fromArray(source.build)).multiply(new Matrix4().fromArray(source.component));}
  else{vertices=[...original.positions];triangles=Array.from({length:vertices.length/3},(_,i)=>i);component=matrix;}
  const positions=[],reverse=component.determinant()<0;for(let f=0;f<triangles.length;f+=3)for(const n of(reverse?[0,2,1]:[0,1,2])){const i=triangles[f+n]*3;positions.push(...new Vector3(...vertices.slice(i,i+3)).applyMatrix4(component).toArray());}
  const native={...structuredClone(original.native),...bakeNativeEmbossMetadata(original,{worldMatrix:world}),groupId:'multipart-import',objectName:name,objectSettings:{extruder:'1'},partSettings:{},instanceAutoDrop:true,meshSource:{version:1,vertices:[...vertices],triangles:[...triangles],component:component.toArray(),build:new Matrix4().toArray()}};
  const part=original.native?.partSettings||{},object=original.native?.objectSettings||{};if(Object.hasOwn(part,'extruder'))native.partSettings.extruder=part.extruder;else if(Object.hasOwn(object,'extruder'))native.partSettings.extruder=object.extruder;
  for(const key of ['instanceFamily','groupTransform','layerConfigRanges','layerHeightProfile','cutId','cutConnector'])delete native[key];
  const copy={...structuredClone(original),id:`multipart-${id++}`,name:original.native?.objectName||original.name,plateId:'plate-1',positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,printable:true,filamentSlot:Number(native.partSettings.extruder)||1,native};delete copy.brimEars;objects.push(copy);
 }}
 const result={...project,name,plates:[{id:'plate-1',name:'Plate 1'}],activePlateId:'plate-1',objects,selectedId:objects[0]?.id||null,selectedIds:objects.length?[objects[0].id]:[],selectionScope:'object',selectionFrame:null};validateProject(result);return result;
}
