import {Matrix4,Vector3} from 'three';
import {createMesh} from './geometry.js';
import {emptyProject} from './project.js';
import {normalizePainting} from './facet-painting.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';
import {normalizeObjectSettings,NATIVE_PART_ROLES} from './native-object-settings.js';
import {normalizePrusaSource,prusaSourceWarnings} from './prusa-provenance.js';
export const PRUSA_NATIVE_REVISION='8500fcdccaa10b5099ac20d252af3a7c560046f1';
export const NATIVE_IMPORTED_FILAMENT_COLORS=Object.freeze(['#00C1AE','#F4E2C1','#ED1C24','#00FF7F','#F26722','#FFEB31','#7841CE','#115877','#ED1E79','#2EBDEF','#345B2F','#800080','#FA8173','#800000','#F7B763','#A4C41E']);
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
function text(value,label){if(typeof value!=='string'||!value.trim()||value.length>1000||value.includes('\0'))throw new Error(`Invalid native Prusa ${label}`);return value;}
function matrix(value){if(!Array.isArray(value)||value.length!==12||!value.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e9))throw new Error('Invalid native Prusa transform');const m=new Matrix4().set(value[0],value[3],value[6],value[9],value[1],value[4],value[7],value[10],value[2],value[5],value[8],value[11],0,0,0,1);if(Math.abs(m.determinant())<1e-18)throw new Error('Singular native Prusa transform');return m;}
function settings(value,count,part=false){if(!plain(value)||Object.keys(value).some(key=>key!=='extruder'))throw new Error('Unexpected process settings from pinned native Prusa importer');return normalizeObjectSettings(value,count,{part});}
/** Convert the actual pinned GUI importer result, keeping separate native parts,
 * facet indices and original local vertex frames. No geometry inference occurs. */
export function projectFromPrusaModel(data,{name='Imported Prusa project',nativeSettings,nativeLegacySource,ids}={}){
 if(!plain(data)||data.format!=='orca-native-prusa-import'||data.version!==1||data.sourceRevision!==PRUSA_NATIVE_REVISION||!Array.isArray(data.objects)||!data.objects.length||data.objects.length>10000||!plain(data.settings)||Object.keys(data.settings).length||!Number.isInteger(data.requiredFilamentCount)||data.requiredFilamentCount<1||data.requiredFilamentCount>64)throw new Error('Invalid native Prusa importer result');
 const count=nativeSettings?.filament_settings_id?.length;if(!Number.isInteger(count)||count<data.requiredFilamentCount||count>64)throw new Error('Selected settings lack the imported Prusa material slots');
 const project={...emptyProject(),name:text(name,'project name'),nativeWorkflow:true,useEmbeddedSettings:true,nativeSettings:structuredClone(nativeSettings),nativePresetNames:{printer:nativeSettings.printer_settings_id,process:nativeSettings.print_settings_id,filaments:[...nativeSettings.filament_settings_id]},nativeLegacySource:normalizePrusaSource(nativeLegacySource),...(ids&&{ids:{printerId:ids.printerId||'',processId:ids.processId||'',filamentId:ids.filamentId||ids.filamentIds?.[0]||''}})},objects=[];let triangles=0;const budget={nodes:0};
 for(const[objectIndex,object]of data.objects.entries()){
  if(!plain(object)||!Array.isArray(object.instances)||!object.instances.length||!Array.isArray(object.volumes)||!object.volumes.length||object.instances.length*object.volumes.length>10000||typeof object.printable!=='boolean')throw new Error('Invalid native Prusa object');
  const objectName=text(object.name,'object name'),objectSettings=settings(object.settings,count);
  if(object.layerHeightProfile?.length||object.layerConfigRanges?.length)throw new Error('Unexpected height metadata from pinned native Prusa importer');
  for(const[instanceIndex,instance]of object.instances.entries()){
   if(!plain(instance)||typeof instance.printable!=='boolean')throw new Error('Invalid native Prusa instance');const build=matrix(instance.matrix),groupId=`prusa-object-${objectIndex+1}-instance-${instanceIndex+1}`;
   for(const[volumeIndex,volume]of object.volumes.entries()){
    if(!plain(volume)||!Object.hasOwn(NATIVE_PART_ROLES,volume.type)||!Array.isArray(volume.positions)||!volume.positions.length||volume.positions.length%9||!volume.positions.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e7))throw new Error('Invalid native Prusa part');
    triangles+=volume.positions.length/9;if(triangles>2000000||objects.length>=10000)throw new Error('Native Prusa scene exceeds geometry limits');
    const component=matrix(volume.matrix),combined=build.clone().multiply(component),reversed=combined.determinant()<0,positions=[],partSettings=settings(volume.settings,count,true);
    for(let face=0;face<volume.positions.length;face+=9)for(const vertex of reversed?[0,2,1]:[0,1,2]){const point=new Vector3(...volume.positions.slice(face+vertex*3,face+vertex*3+3)).applyMatrix4(combined);positions.push(point.x,point.y,point.z);}
    const painting=normalizePainting({...volume.painting,...(reversed?{winding:-1}:{})},volume.positions.length/9,{filamentCount:count,budget});
    const mesh=createMesh({id:`${groupId}-part-${volumeIndex+1}`,name:text(volume.name,'part name'),plateId:'plate-1',positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,printable:object.printable&&instance.printable,filamentSlot:Number(partSettings.extruder)||Number(objectSettings.extruder)||1,painting,native:{groupId,objectName,partType:volume.type,objectSettings:{...objectSettings},partSettings,meshSource:{version:1,vertices:[...volume.positions],triangles:Array.from({length:volume.positions.length/3},(_,i)=>i),build:build.toArray(),component:component.toArray()}}});
    normalizeNativeMeshSource(mesh);objects.push(mesh);
   }
  }
 }
 if(!objects.some(o=>o.printable&&o.native.partType==='normal_part'))throw new Error('Prusa project contains no printable normal part');
 project.objects=objects;project.selectedId=objects[0].id;project.selectedIds=[objects[0].id];project.nativeImportWarnings=prusaSourceWarnings(project.nativeLegacySource);return project;
}
