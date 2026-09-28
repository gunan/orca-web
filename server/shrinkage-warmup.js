import {XMLParser,XMLBuilder} from 'fast-xml-parser';
import {strFromU8,strToU8,zipSync} from 'fflate';
import {extractBoundedZip} from '../shared/import-limits.js';
import {plateShrinkageContext} from '../shared/plate-shrinkage.js';
import {exportNative3MF,nativeBed,nativePlateOrigin,validateNativeArchiveSafety} from '../shared/native-project.js';

// Pinned OrcaSlicer.cpp 5638/6103/6296: --slice 0 with >1 populated plate
// applies every plate once to pre-check, then applies again before slicing.
// PrintApply.cpp1534 consults shrinkage before first-load m_objects is populated
// at1593. The second apply is needed for the exact installed2.4.2 positive case.
// Internal plate2 uses new build instances of the SAME resources. No vertex,
// part settings, ranges, auxiliary brim point or facet attribute is rescaled.
const array=value=>value===undefined?[]:Array.isArray(value)?value:[value];
const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,trimValues:false});
const builder=new XMLBuilder({ignoreAttributes:false,format:false,suppressEmptyNode:true});
function metadata(node,key,value){const entries=array(node.metadata);const old=entries.find(entry=>entry['@_key']===key);if(old)old['@_value']=String(value);else entries.push({'@_key':key,'@_value':String(value)});node.metadata=entries;}
function value(node,key){return array(node.metadata).find(entry=>entry['@_key']===key)?.['@_value'];}
function translated(transform,delta){const a=transform?String(transform).trim().split(/\s+/).map(Number):[1,0,0,0,1,0,0,0,1,0,0,0];if(a.length!==12||!a.every(Number.isFinite))throw new Error('Invalid internal shrinkage instance transform');for(let axis=0;axis<3;axis++)a[9+axis]+=delta[axis];return a.join(' ');}
/** Input must be the server-sanitized one-plate project. Return null when the
 * source-derived used-material compensation is unity or another engine is used.
 * The private archive is never an exported user project or second print job. */
export function prepareShrinkageWarmup({project,bytes,engineVersion}){
  if(engineVersion!=='OrcaSlicer-2.4.2')return null;
  if(project.plates?.length!==1)throw new Error('Shrinkage initialization requires one selected plate');
  const plate=project.plates[0],settings=project.nativeSettings,filamentCount=array(settings?.filament_settings_id).length;
  const context=plateShrinkageContext(project.objects,plate.id,settings,{filamentCount,materialSettingsComplete:true,plate});
  if(context.shrinkageCompensation.every(value=>value===1))return null;
  const source=bytes||exportNative3MF(project,{includeWebProject:false});validateNativeArchiveSafety(source);
  const files=extractBoundedZip(source),model=parser.parse(strFromU8(files['3D/3dmodel.model'])),config=parser.parse(strFromU8(files['Metadata/model_settings.config']));
  const plates=array(config.config?.plate),items=array(model.model?.build?.item);
  if(plates.length!==1||!items.length||items.length>10000)throw new Error('Invalid internal shrinkage source plate');
  const origin=nativePlateOrigin(1,2,nativeBed(settings)),duplicate=structuredClone(plates[0]),ids=new Set(items.map(item=>String(item['@_objectid'])));
  if(ids.size!==items.length||items.some(item=>item['@_p:path']))throw new Error('Shrinkage initialization expects server-generated native object instances');
  metadata(plates[0],'plater_id',1);metadata(duplicate,'plater_id',2);metadata(duplicate,'plater_name','Internal shrinkage initialization');
  for(const instance of array(duplicate.model_instance)){if(!ids.has(value(instance,'object_id')))throw new Error('Invalid internal shrinkage plate membership');metadata(instance,'instance_id',1);metadata(instance,'identify_id',Number(value(instance,'identify_id'))+100000);}
  config.config.plate=[plates[0],duplicate];
  model.model.build.item=[...items,...items.map(item=>({...structuredClone(item),'@_transform':translated(item['@_transform'],origin)}))];
  files['3D/3dmodel.model']=strToU8(builder.build(model));files['Metadata/model_settings.config']=strToU8(builder.build(config));
  const configSettings=JSON.parse(strFromU8(files['Metadata/project_settings.config']));
  for(const key of ['wipe_tower_x','wipe_tower_y'])if(configSettings[key])configSettings[key]=[array(configSettings[key])[0],array(configSettings[key])[0]];
  files['Metadata/project_settings.config']=strToU8(JSON.stringify(configSettings));
  if(files['Metadata/filament_sequence.json']){const sequences=JSON.parse(strFromU8(files['Metadata/filament_sequence.json']));sequences.plate_2=structuredClone(sequences.plate_1);files['Metadata/filament_sequence.json']=strToU8(JSON.stringify(sequences));}
  if(files['Metadata/custom_gcode_per_layer.xml']){const events=parser.parse(strFromU8(files['Metadata/custom_gcode_per_layer.xml'])),entry=array(events.custom_gcodes_per_layer?.plate);if(entry.length!==1)throw new Error('Invalid internal shrinkage layer events');const copy=structuredClone(entry[0]);copy.plate_info['@_id']='2';events.custom_gcodes_per_layer.plate=[entry[0],copy];files['Metadata/custom_gcode_per_layer.xml']=strToU8(builder.build(events));}
  delete files['Metadata/orca-web.json'];
  const result=zipSync(files,{level:6});validateNativeArchiveSafety(result);
  return{version:1,bytes:result,expectedOutputNames:['plate_1.gcode','plate_2.gcode'],targetOutputName:'plate_1.gcode',summary:{method:'native-two-apply',engineVersion,usedFilamentSlots:context.usedFilamentSlots,compensation:context.shrinkageCompensation,internalPlateCount:2}};
}
