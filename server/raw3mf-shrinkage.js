import {readFile,stat,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {XMLParser,XMLBuilder} from 'fast-xml-parser';
import {strFromU8,strToU8,zipSync} from 'fflate';
import {extractBoundedZip} from '../shared/import-limits.js';
import {importNative3MF,nativeBed,nativePlateOrigin,validateNativeArchiveSafety} from '../shared/native-project.js';
import {plateShrinkageContext} from '../shared/plate-shrinkage.js';

const array=value=>value===undefined?[]:Array.isArray(value)?value:[value];
const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,trimValues:false});
const builder=new XMLBuilder({ignoreAttributes:false,format:false,suppressEmptyNode:true});
const get=(node,key)=>array(node.metadata).find(entry=>entry['@_key']===key)?.['@_value'];
function set(node,key,value){const entries=array(node.metadata),old=entries.find(entry=>entry['@_key']===key);if(old)old['@_value']=String(value);else entries.push({'@_key':key,'@_value':String(value)});node.metadata=entries;}
function translated(transform,delta){const values=transform?String(transform).trim().split(/\s+/).map(Number):[1,0,0,0,1,0,0,0,1,0,0,0];if(values.length!==12||!values.every(Number.isFinite))throw new Error('Invalid native archive instance transform');for(let axis=0;axis<3;axis++)values[9+axis]+=delta[axis];return values.join(' ');}

// Native bbs_3mf.cpp:2228-2250 normalizes material IDs before applying
// externally selected presets, and removes a sole volume's material override.
// Model the imported engine state for compensation without altering the archive.
export function rawArchiveMaterialContext(project){
  const result=structuredClone(project),groups=new Map(),max=array(project.nativeSettings?.filament_settings_id).length||Number.MAX_SAFE_INTEGER;
  for(const object of result.objects){const key=object.native?.groupId||object.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(object);}
  for(const members of groups.values()){
    const raw=Number(members[0].native?.objectSettings?.extruder||0),base=raw===0||raw>max?1:raw;
    for(const object of members){const part=Number(object.native?.partSettings?.extruder||0),slot=members.length===1?base:part===0?base:part>max?1:part;object.filamentSlot=slot;object.native={...object.native,objectSettings:{...object.native?.objectSettings,extruder:String(base)},partSettings:{...object.native?.partSettings,extruder:String(slot)}};}
  }
  return result;
}

/** Preserve the source native resources and per-part configuration. The actual
 * engine has already resolved global configuration; the final invocation keeps
 * those same external profiles, so native machine/bed adaptation still runs.
 * No geometry is exported or rescaled by this adapter. */
export function initializeRawNativeArchive(bytes,settings,{engineVersion='OrcaSlicer-2.4.2'}={}){
  if(engineVersion!=='OrcaSlicer-2.4.2')return null;
  validateNativeArchiveSafety(bytes);
  if(['filament_shrink','filament_shrinkage_compensation_z'].every(key=>array(settings[key]).every(value=>Number(String(value).replace(/%$/,''))===100)))return null;
  const files=extractBoundedZip(bytes),project=rawArchiveMaterialContext(importNative3MF(bytes)),filamentCount=array(settings.filament_settings_id).length;
  if(!files['Metadata/project_settings.config']||!files['Metadata/model_settings.config'])throw new Error('Raw geometry-only 3MF needs native placement before shrinkage initialization');
  if(project.plates.length!==1)throw new Error('Raw 3MF jobs support one plate; select a plate through the native project workflow');
  const plate=project.plates[0],context=plateShrinkageContext(project.objects,plate.id,settings,{filamentCount,materialSettingsComplete:true,plate});
  if(context.shrinkageCompensation.every(value=>value===1))return null;
  const model=parser.parse(strFromU8(files['3D/3dmodel.model'])),config=parser.parse(strFromU8(files['Metadata/model_settings.config'])),plates=array(config.config?.plate),items=array(model.model?.build?.item);
  if(plates.length!==1||Number(get(plates[0],'plater_id')||1)!==1||!items.length||items.length>10000)throw new Error('Raw 3MF shrinkage initialization needs one native first plate');
  const originalSettings=JSON.parse(strFromU8(files['Metadata/project_settings.config'])),origin=nativePlateOrigin(1,2,nativeBed(originalSettings)),counts=new Map();
  for(const item of items){const id=String(item['@_objectid']);counts.set(id,(counts.get(id)||0)+1);}
  const first=plates[0],duplicate=structuredClone(first),members=array(first.model_instance);
  // Every source build instance must have explicit plate membership; never add
  // hidden, unassigned or orphaned instances to the target plate implicitly.
  const keys=new Set();for(const member of members){const id=get(member,'object_id'),index=Number(get(member,'instance_id')||0),key=`${id}:${index}`;if(!counts.has(id)||!Number.isInteger(index)||index<0||index>=counts.get(id)||keys.has(key))throw new Error('Invalid native archive plate membership');keys.add(key);}
  if(keys.size!==items.length)throw new Error('Raw 3MF contains build instances outside its selected plate');
  set(first,'plater_id',1);set(duplicate,'plater_id',2);set(duplicate,'plater_name','Internal shrinkage initialization');
  for(const instance of array(duplicate.model_instance)){set(instance,'instance_id',Number(get(instance,'instance_id')||0)+counts.get(get(instance,'object_id')));set(instance,'identify_id',Number(get(instance,'identify_id')||0)+100000);}
  config.config.plate=[first,duplicate];model.model.build.item=[...items,...items.map(item=>({...structuredClone(item),'@_transform':translated(item['@_transform'],origin)}))];
  files['3D/3dmodel.model']=strToU8(builder.build(model));files['Metadata/model_settings.config']=strToU8(builder.build(config));
  for(const key of ['wipe_tower_x','wipe_tower_y'])if(originalSettings[key])originalSettings[key]=[array(originalSettings[key])[0],array(originalSettings[key])[0]];
  files['Metadata/project_settings.config']=strToU8(JSON.stringify(originalSettings));
  if(files['Metadata/filament_sequence.json']){const sequence=JSON.parse(strFromU8(files['Metadata/filament_sequence.json']));if(sequence.plate_1)sequence.plate_2=structuredClone(sequence.plate_1);files['Metadata/filament_sequence.json']=strToU8(JSON.stringify(sequence));}
  if(files['Metadata/custom_gcode_per_layer.xml']){const events=parser.parse(strFromU8(files['Metadata/custom_gcode_per_layer.xml'])),entries=array(events.custom_gcodes_per_layer?.plate);if(entries.length!==1)throw new Error('Invalid native archive layer events');const duplicate=structuredClone(entries[0]);duplicate.plate_info['@_id']='2';events.custom_gcodes_per_layer.plate=[entries[0],duplicate];files['Metadata/custom_gcode_per_layer.xml']=strToU8(builder.build(events));}
  delete files['Metadata/orca-web.json'];const result=zipSync(files,{level:6});validateNativeArchiveSafety(result);
  return{version:1,sourceMode:'native-archive',bytes:result,expectedOutputNames:['plate_1.gcode','plate_2.gcode'],targetOutputName:'plate_1.gcode',summary:{method:'native-two-apply',engineVersion,usedFilamentSlots:context.usedFilamentSlots,compensation:context.shrinkageCompensation,internalPlateCount:2,configuration:'native-profile-merge'}};
}

/** Pinned OrcaSlicer.cpp 5577 exports merged settings before Print::apply.
 * Native archives retain their original resources. Other accepted 3MF dialects
 * are normalized by the installed native importer/exporter, preserving the
 * native engine's part/material interpretation and placement without STL loss. */
export async function prepareRaw3MFShrinkageWarmup({input,engineVersion,binary,work,printerPath,profilePath,filamentPath,signal,runNative,timeoutMs}){
  if(engineVersion!=='OrcaSlicer-2.4.2')return null;
  const deadline=Number.isFinite(timeoutMs)?Date.now()+timeoutMs:null;
  const remaining=()=>{signal?.throwIfAborted();if(deadline===null)return undefined;const left=deadline-Date.now();if(left<=0)throw new Error('Native 3MF settings normalization timed out');return left;};
  remaining();const size=(await stat(input)).size;if(size>128*1024*1024)throw new Error('3MF exceeds its 128 MB archive limit');
  const bytes=await readFile(input);validateNativeArchiveSafety(bytes);const files=extractBoundedZip(bytes),nativeArchive=Boolean(files['Metadata/project_settings.config']&&files['Metadata/model_settings.config']);
  // Model::read_from_file uses load_bbs_3mf; the GUI's Prusa-specific
  // read_from_archive dispatch is unavailable through this installed CLI.
  // Do not silently discard configuration the GUI would have interpreted.
  if(!nativeArchive&&Object.keys(files).some(name=>/^Metadata\/Slic3r_PE(?:[_.]|$)/i.test(name)))throw new Error('Prusa 3MF settings require the native archive importer; installed CLI normalization cannot preserve those settings');
  const directory=path.join(work,'native-settings');await mkdir(directory);await mkdir(path.join(directory,'config'));
  const output=path.join(directory,'merged.json'),baseArgs=['--export-settings',output,'--outputdir',directory,'--datadir',path.join(directory,'config')],settings=[printerPath,profilePath].filter(Boolean);
  if(settings.length)baseArgs.push('--load-settings',settings.join(';'));if(filamentPath)baseArgs.push('--load-filaments',filamentPath);
  const execute=async extra=>{await runNative(binary,[...baseArgs,...extra,path.resolve(input)],{cwd:directory,signal,timeoutMs:remaining()});remaining();if((await stat(output)).size>4*1024*1024)throw new Error('Native merged settings exceed the 4 MB limit');return JSON.parse(await readFile(output,'utf8'));};
  let merged=await execute([]);
  if(nativeArchive)return initializeRawNativeArchive(bytes,merged,{engineVersion});
  if(['filament_shrink','filament_shrinkage_compensation_z'].every(key=>array(merged[key]).every(value=>Number(String(value).replace(/%$/,''))===100)))return null;
  // The native writer prepends --outputdir to this filename. An absolute output
  // filename is invalid here. This native action may initialize graphics, so a
  // graphics-denied host must report its failure instead of flattening the input.
  const normalizedName='normalized.3mf';merged=await execute(['--export-3mf',normalizedName]);
  const normalized=path.join(directory,normalizedName);if((await stat(normalized)).size>128*1024*1024)throw new Error('Native normalized 3MF exceeds its 128 MB archive limit');
  const normalizedBytes=await readFile(normalized);remaining();validateNativeArchiveSafety(normalizedBytes);
  const warm=initializeRawNativeArchive(normalizedBytes,merged,{engineVersion});
  if(warm)warm.summary.configuration='native-archive-normalization';
  return warm;
}
