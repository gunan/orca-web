import {nativeExpressionGroupKeys,normalizeNativeExpressionGroups} from '../shared/preset-compatibility.js';
import {normalizeInstanceFamily,normalizeInstanceAutoDrop} from '../shared/native-instances.js';
import {createNativeConfigurationService} from './native-config.js';
import {validateNativeVariantVectors,hasExpandedNativeVariants} from '../shared/native-variants.js';
import {normalizePurgeSettings} from '../shared/purge-volumes.js';
import {inspectPrusaArchive,importPrusaArchive} from './native-prusa.js';
import {normalizeNativeMeshSource} from '../shared/native-mesh-source.js';
import {normalizeNativeEmbossMetadata} from '../shared/native-emboss.js';
import {bindGeneratedPatternProject,assertGeneratedPatternProjectUnchanged} from '../shared/generated-pattern-binding.js';
import {normalizedCutMetadata} from '../shared/cut-metadata.js';
import {normalizeLayerHeightProfile,layerProfileContext} from '../shared/variable-layers.js';
import {SEQUENCE_KEYS,normalizePrintSequenceSettings,normalizeFilamentSequence} from '../shared/filament-sequence.js';
import {canonicalPreset} from '../shared/canonical-preset.js';
import {normalizePainting} from '../shared/facet-painting.js';
import { normalizeHeightRanges } from '../shared/height-ranges.js';
import {normalizeBrimEars} from '../shared/brim-ears.js';
import {normalizeTextConfiguration} from '../shared/text-geometry.js';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { normalizeSceneGroupFrame } from '../shared/scene-object-operations.js';
import { parseProject } from '../shared/project.js';
import { meshBounds } from '../shared/geometry.js';
import { definitionsByScope, applyProfileOverrides, normalizeNativeProfileValues, normalizeNativeProjectValues, projectSettingDefinitions } from '../shared/profile-settings.js';
import { importNative3MF, exportNative3MF, nativeSettingsFromSelection, nativeBed, normalizeNativeLayerEvents, validateNativeArchiveSafety } from '../shared/native-project.js';
import { normalizeObjectSettings } from '../shared/native-object-settings.js';
import { applyNativeCorrectionDecisions } from '../shared/native-setting-corrections.js';
export { normalizeObjectSettings, supportedObjectSettings, supportedPartSettings } from '../shared/native-object-settings.js';

const scopeByKey=new Map();
for(const [scope,definitions]of Object.entries(definitionsByScope))for(const definition of definitions)if(!scopeByKey.has(definition.key))scopeByKey.set(definition.key,scope);
const projectKeys=new Set(projectSettingDefinitions.map(definition=>definition.key));
const plumbing=new Set(['name','version','from','inherits','instantiation','setting_id','filament_id','compatible_printers','compatible_printers_condition','compatible_prints','compatible_prints_condition','different_settings_to_system','inherits_group','print_compatible_printers','printer_compatible_prints','bbl_use_printhost']);
const connection=/^(?:print_host$|printhost_|flashforge_serial_number$|printer_agent|host_type$|printer_access_code$|access_code$|api_key$|auth_token$|password$|secret$|token$)/;
const roles=new Set(['normal_part','negative_part','modifier_part','support_enforcer','support_blocker']);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const list=value=>value==null?[]:Array.isArray(value)?value:[value];
const nonempty=value=>Array.isArray(value)?value.some(nonempty):value!=null&&String(value).trim()!=='';
function text(value,label,max=1000){if(typeof value!=='string'||!value||value.length>max||value.includes('\0'))throw new Error(`Invalid ${label}`);return value;}
function slot(value,count,label='filament slot',allowZero=false){const n=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;if(!Number.isInteger(n)||n<(allowZero?0:1)||n>count)throw new Error(`Invalid ${label}: choose ${allowZero?'0–':'1–'}${count}`);return n;}

/** Known project/profile settings only; post-process hooks are never executable. */
export function normalizeProjectSettings(values,{strict=true}={}){
  if(!plain(values))throw new Error('Native project settings must be an object');
  const settings={},warnings=[],unsupported=[];
  for(const [key,value]of Object.entries(values)){
    if(key==='post_process'&&nonempty(value))throw new Error('Post-processing scripts are disabled on the web server');
    if(connection.test(key)){if(nonempty(value))warnings.push(`Connection setting ${key} was omitted.`);continue;}
    if(plumbing.has(key))continue;
    if(nativeExpressionGroupKeys.has(key)){Object.assign(settings,normalizeNativeExpressionGroups({[key]:value}));continue;}
    if(scopeByKey.has(key))Object.assign(settings,normalizeNativeProfileValues(scopeByKey.get(key),{[key]:value}));
    else if(projectKeys.has(key))Object.assign(settings,normalizeNativeProjectValues({[key]:value}));
    else unsupported.push(key);
  }
  Object.assign(settings,normalizePrintSequenceSettings(values,list(values.filament_settings_id).length||64));
  if(strict&&unsupported.length)throw new Error(`Unsupported embedded project settings: ${unsupported.join(', ')}`);
  if(unsupported.length)warnings.push(`Unsupported embedded project settings were omitted: ${unsupported.join(', ')}.`);
  return{settings:{...settings,name:'project_settings',version:'2.4.2'},warnings,unsupported};
}


function sanitizeObjects(project,settings,{checkBuildVolume=true}={}){
  const filamentCount=list(settings.filament_settings_id).length;
  if(filamentCount<1||filamentCount>64)throw new Error('Native project needs 1–64 filament slots');
  const bed=nativeBed(settings);if(!bed||!(bed.height>0))throw new Error('Native project needs valid printable area and height');
  const groupConfigs=new Map(),paintBudget={nodes:0};
  const objects=project.objects.map(object=>{
    const source=object.native||{},partType=source.partType||'normal_part';
    if(!roles.has(partType))throw new Error(`Unsupported native part type: ${partType}`);
    const groupId=source.groupId?text(source.groupId,'native object group',256):object.id;
    const objectSettings=normalizeObjectSettings(source.objectSettings||{},filamentCount),partSettings=normalizeObjectSettings(source.partSettings||{},filamentCount,{part:true,preserveNativeObjectOptions:true});
    const layerConfigRanges=normalizeHeightRanges(source.layerConfigRanges||[],filamentCount,{printer:settings});
    const layerHeightProfile=normalizeLayerHeightProfile(source.layerHeightProfile||[]);
    const inherited=Number(partSettings.extruder)||Number(objectSettings.extruder)||1;
    const filamentSlot=slot(object.filamentSlot??inherited,filamentCount);
    const cut=normalizedCutMetadata(source),meshSource=normalizeNativeMeshSource(object);
    const native={instanceAutoDrop:normalizeInstanceAutoDrop(source.instanceAutoDrop),...(source.instanceFamily&&{instanceFamily:normalizeInstanceFamily(source.instanceFamily)}),...cut,...normalizeNativeEmbossMetadata(source),...(meshSource&&{meshSource}),groupId,objectName:text(source.objectName||object.name,'native object name'),partType,objectSettings,partSettings,...(layerHeightProfile.length&&{layerHeightProfile}),...(layerConfigRanges.length&&{layerConfigRanges}),...(source.groupTransform&&{groupTransform:normalizeSceneGroupFrame(source.groupTransform)})};
    const group=JSON.stringify([object.plateId,groupId]),serialized=JSON.stringify([objectSettings,layerConfigRanges,layerHeightProfile,cut.cutId||null]);
    if(groupConfigs.has(group)&&groupConfigs.get(group)!==serialized)throw new Error('Parts of the same native object must share object settings, height ranges, variable layer profiles and cut identities');groupConfigs.set(group,serialized);
    if(checkBuildVolume&&partType==='normal_part'&&object.visible!==false&&object.printable!==false){
      const bounds=meshBounds(object),epsilon=.001;
      if(!bounds||bounds.min[0]<bed.minX-epsilon||bounds.min[1]<bed.minY-epsilon||bounds.min[2]<-epsilon||bounds.max[0]>bed.minX+bed.width+epsilon||bounds.max[1]>bed.minY+bed.depth+epsilon||bounds.max[2]>bed.height+epsilon)throw new Error(`${object.name} is outside its native build volume`);
    }
    const painting=normalizePainting(object.painting,object.positions.length/9,{filamentCount,budget:paintBudget});
    if(painting&&Object.keys(painting).some(key=>!['version','winding'].includes(key))&&partType!=='normal_part')throw new Error('Facet painting requires a normal part');
    return{...object,...(painting&&{painting}),...(object.brimEars&&{brimEars:normalizeBrimEars(object.brimEars)}),...(object.text&&{text:normalizeTextConfiguration(object.text)}),native,filamentSlot,printable:object.printable!==false};
  });
  for(const object of objects)if(object.visible!==false&&object.native.partType!=='normal_part'&&!objects.some(other=>other.visible!==false&&other.plateId===object.plateId&&other.native.groupId===object.native.groupId&&other.native.partType==='normal_part'))throw new Error(`${object.name} needs a normal part in the same native object group`);
  const validatedProfiles=new Set();
  for(const object of objects)if(object.native.layerHeightProfile?.length){const group=JSON.stringify([object.plateId,object.native.groupId]);if(!validatedProfiles.has(group)){normalizeLayerHeightProfile(object.native.layerHeightProfile,layerProfileContext(objects,object.id,settings,{filamentCount}));validatedProfiles.add(group);}}
  return{objects,filamentCount,bed};
}
function sanitizePlates(project,settings,filamentCount){
  if(project.plates.length>36)throw new Error('Native projects support at most 36 plates');
  const plateKeyMap={bed_type:'curr_bed_type',print_sequence:'print_sequence',first_layer_print_sequence:'first_layer_print_sequence',other_layers_print_sequence:'other_layers_print_sequence',other_layers_print_sequence_nums:'other_layers_print_sequence_nums',spiral_mode:'spiral_mode',filament_map_mode:'filament_map_mode',filament_map:'filament_map'};
  return project.plates.map(plate=>{
    const metadata={};
    for(const [key,value]of Object.entries(plate.native?.metadata||{})){
      const globalKey=plateKeyMap[key];if(!globalKey||SEQUENCE_KEYS.includes(key))continue;
      const numericVector=['first_layer_print_sequence','other_layers_print_sequence','filament_map'].includes(key);
      let input=numericVector?String(value).trim().split(/\s+/).filter(Boolean):value;
      if(key==='spiral_mode')input=value==='true'?'1':value==='false'?'0':value;
      const normalized=projectKeys.has(globalKey)?normalizeNativeProjectValues({[globalKey]:input})[globalKey]:normalizeNativeProfileValues('process',{[globalKey]:input})[globalKey];
      metadata[key]=Array.isArray(normalized)?normalized.join(' '):key==='spiral_mode'?(normalized==='1'?'true':'false'):normalized;
    }
    const order=normalizePrintSequenceSettings(plate.native?.metadata||{},filamentCount);
    for(const[key,value]of Object.entries(order))metadata[key]=Array.isArray(value)?value.join(' '):value;
    const filamentSequence=plate.native?.filamentSequence?normalizeFilamentSequence(plate.native.filamentSequence,{filamentCount,nozzleCount:list(settings.nozzle_diameter).length}):null;
    let layerEvents;
    if(plate.layerEvents){layerEvents=normalizeNativeLayerEvents(plate.layerEvents);for(const event of layerEvents.items){if(event.printZ>Number(settings.printable_height))throw new Error('A layer event exceeds the printer height');if(['ColorChange','ToolChange'].includes(event.type))slot(event.extruder,filamentCount,'layer-event extruder');}}
    return{id:plate.id,name:plate.name,locked:Boolean(plate.locked),native:{metadata,...(filamentSequence&&{filamentSequence})},...(layerEvents&&{layerEvents})};
  });
}
function validateProjectVectors(settings,filamentCount){
  if (!settings.filament_colour) settings.filament_colour = Array(filamentCount).fill(projectSettingDefinitions.find(item=>item.key==='filament_colour').default[0]);
  if (settings.filament_map && (settings.filament_map.length !== filamentCount || settings.filament_map.some(value=>!Number.isInteger(Number(value))||Number(value)<1||Number(value)>list(settings.nozzle_diameter).length))) throw new Error('Filament mapping must contain one valid nozzle assignment per filament slot');
  const variants=validateNativeVariantVectors(settings,filamentCount);
  for(const key of ['filament_colour','filament_diameter','filament_type','nozzle_temperature','nozzle_temperature_initial_layer'])if(settings[key]&&list(settings[key]).length!==(['nozzle_temperature','nozzle_temperature_initial_layer'].includes(key)?variants.filamentVariantCount:filamentCount))throw new Error(`${key} must contain one entry per filament slot`);
  Object.assign(settings,normalizePurgeSettings(settings,filamentCount));
}

export function createNativeProjectService({catalog,nativeConfig=createNativeConfigurationService()}={}){
  const {resolveCatalogNativeSettings,resolveEmbeddedNativeSettings}=nativeConfig;
  if(!catalog)throw new Error('Native project service requires a preset catalog');
  async function matchPresets(project){
    const catalogList=await catalog.list(),matches={};
    function match(name,options){const choices=options.filter(item=>item.name===name);return{name,id:choices.length===1?choices[0].id:null,status:choices.length===1?'matched':choices.length?'ambiguous':'missing'};}
    matches.printer=match(project.nativePresetNames?.printer||'',catalogList.printers);
    const choices=matches.printer.id?await catalog.list({printerId:matches.printer.id}):{processes:[],filaments:[]};
    matches.process=match(project.nativePresetNames?.process||'',choices.processes);
    matches.filaments=list(project.nativePresetNames?.filaments).map(name=>match(name,choices.filaments));
    const selection={printerId:matches.printer.id||'',processId:matches.process.id||'',filamentIds:matches.filaments.map(item=>item.id||'')};
    const fallbackSelection={...catalogList.defaults,filamentIds:[catalogList.defaults.filamentId]};
    return{matches,selection,fallbackSelection};
  }
  async function importArchive(bytes,{filename='Project.3mf',selection,overrides={},nativeSettings,processCorrectionDecisions,workerPath,signal}={}){
    validateNativeArchiveSafety(bytes);
    let imported;
    if(inspectPrusaArchive(bytes)){
      if(nativeSettings!==undefined){
        if(selection!==undefined||Object.keys(overrides).length)throw new Error('Choose embedded settings or catalog presets for Prusa import');
        imported=await importPrusaArchive(bytes,{filename,nativeSettings,context:catalog.getSettingsContext?.(nativeSettings),workerPath,signal,processCorrectionDecisions});
      }else{
      selection=selection||{...(await catalog.list()).defaults};
      if(!plain(selection)||!plain(overrides)||Object.keys(overrides).some(key=>!['machine','process','filaments','project'].includes(key)))throw new Error('Invalid Prusa preset context');
      const filamentIds=selection.filamentIds||[selection.filamentId];
      if(!Array.isArray(filamentIds)||!filamentIds.length||filamentIds.length>64)throw new Error('Choose1–64 native filament presets');
      if(overrides.filaments&&(!Array.isArray(overrides.filaments)||overrides.filaments.length!==filamentIds.length))throw new Error('Filament overrides must match the selected slot count');
      const native=await resolveCatalogNativeSettings({catalog,selection:{...selection,filamentIds},overrides,signal});
      imported=await importPrusaArchive(bytes,{filename,nativeSettings:normalizeProjectSettings(native.archiveSettings).settings,context:native.context,workerPath,signal,processCorrectionDecisions});
      }
    }
    const project=imported?.project||importNative3MF(bytes,{filename}),normalized=normalizeProjectSettings(project.nativeSettings,{strict:false});
    project.nativeSettings=normalized.settings;project.nativeUnsupportedSettings=normalized.unsupported;
    Object.assign(project,bindGeneratedPatternProject(project));
    project.nativeContext=catalog.getSettingsContext?.(project.nativeSettings);
    const matched=await matchPresets(project);
    project.ids={printerId:matched.selection.printerId,processId:matched.selection.processId,filamentId:matched.selection.filamentIds[0]||''};
    const warnings=[...(project.nativeImportWarnings||[]),...normalized.warnings];
    if([matched.matches.printer,matched.matches.process,...matched.matches.filaments].some(item=>item.status!=='matched'))warnings.push('Some native preset names do not match compatible installed presets. Choose embedded settings or explicitly select replacements.');
    project.nativeImportWarnings=[...new Set(warnings)];
    return{project,...matched,warnings:project.nativeImportWarnings,...(imported&&{nativeImport:imported.nativeImport})};
  }
  async function prepare(request,{geometryOnly=false,allowEmptyGeometry=false,signal}={}){
    if(!plain(request)||!plain(request.project))throw new Error('A project request is required');
    const project=parseProject(JSON.stringify(request.project)),warnings=[];
    assertGeneratedPatternProjectUnchanged(project,{useEmbeddedSettings:request.useEmbeddedSettings===true,plateId:request.plateId||project.activePlateId});
    if(request.allPlates!==undefined&&typeof request.allPlates!=='boolean')throw new Error('allPlates must be a boolean');
    const allPlates=request.allPlates===true,plateId=request.plateId||project.activePlateId;
    if(!project.plates.some(plate=>plate.id===plateId))throw new Error('Selected native project plate is missing');
    if(request.useEmbeddedSettings!==undefined&&typeof request.useEmbeddedSettings!=='boolean')throw new Error('useEmbeddedSettings must be a boolean');
    let settings,effectiveSettings,selection=request.selection||{},source;
    const overrides=request.overrides||{};if(!plain(overrides))throw new Error('Project overrides must be an object');
    for(const key of Object.keys(overrides))if(!['machine','process','filaments','project'].includes(key))throw new Error(`Unsupported project override scope: ${key}`);
    if(request.useEmbeddedSettings){
      if(project.nativeUnsupportedSettings?.length)throw new Error(`Unsupported embedded project settings: ${project.nativeUnsupportedSettings.join(', ')}`);
      const normalized=normalizeProjectSettings(project.nativeSettings);settings=normalized.settings;warnings.push(...normalized.warnings);source='embedded';
      if(Object.keys(overrides).length)throw new Error('Edit embedded native settings directly; catalog overrides cannot be mixed into embedded mode');
      if(!settings.printer_settings_id||!settings.print_settings_id||!list(settings.filament_settings_id).length)throw new Error('Embedded project lacks complete native printer, process and filament settings');
    }else{
      if(!plain(selection))throw new Error('Preset selection is required');
      text(selection.printerId,'printer preset ID');text(selection.processId,'process preset ID');
      const filamentIds=selection.filamentIds||[selection.filamentId];if(!Array.isArray(filamentIds)||!filamentIds.length||filamentIds.length>64)throw new Error('Choose 1–64 native filament presets');
      const native=await resolveCatalogNativeSettings({catalog,selection:{...selection,filamentIds},overrides,signal});
      const normalized=normalizeProjectSettings(native.archiveSettings);
      settings=normalized.settings;effectiveSettings=normalizeProjectSettings(native.effectiveSettings).settings;
      warnings.push(...normalized.warnings,...native.warnings);selection=native.selection;source='catalog';
    }
    if(request.processCorrectionDecisions !== undefined){
      const result=applyNativeCorrectionDecisions({printer:settings,process:settings,filament:settings,context:{...catalog.getSettingsContext?.(settings),isGlobal:true,isPlate:false,filamentCount:list(settings.filament_settings_id).length,projectSettings:settings}},{scope:'process',decisions:request.processCorrectionDecisions});
      Object.assign(settings,result.nativeChanges);if(effectiveSettings)Object.assign(effectiveSettings,result.nativeChanges);
    }
    assertGeneratedPatternProjectUnchanged(project,{settings,useEmbeddedSettings:request.useEmbeddedSettings===true,plateId});
    const target=allPlates?project:{...project,objects:project.objects.filter(object=>object.plateId===plateId),plates:project.plates.filter(plate=>plate.id===plateId)};
    if(!allPlates){const index=project.plates.findIndex(plate=>plate.id===plateId);for(const key of ['wipe_tower_x','wipe_tower_y'])if(settings[key]?.length>1)settings[key]=[settings[key][index]??settings[key][0]];}
    validateProjectVectors(settings,list(settings.filament_settings_id).length);
    if(!effectiveSettings)effectiveSettings=hasExpandedNativeVariants(settings)?normalizeProjectSettings(await resolveEmbeddedNativeSettings(settings,{signal})).settings:settings;
    const checked=sanitizeObjects(target,effectiveSettings,{checkBuildVolume:!geometryOnly});
    const plates=sanitizePlates(target,settings,checked.filamentCount);
    const chosen=allPlates?plates:plates.filter(plate=>plate.id===plateId),objects=checked.objects.filter(object=>chosen.some(plate=>plate.id===object.plateId));
    if(!(geometryOnly&&allowEmptyGeometry)&&!objects.some(object=>object.visible!==false&&object.printable!==false&&object.native.partType==='normal_part'))throw new Error('The selected plate has no printable normal parts');
    const sanitized={...project,objects,plates:chosen,activePlateId:plateId,nativeSettings:settings,nativeUnsupportedSettings:[],selectedId:objects.some(object=>object.id===project.selectedId)?project.selectedId:objects[0]?.id||null};
    Object.assign(sanitized,bindGeneratedPatternProject(sanitized));
    const bytes=geometryOnly?null:exportNative3MF(sanitized,{settings,allPlates:true});if(bytes)validateNativeArchiveSafety(bytes);
    const summary={source,plateId,plateName:plates.find(plate=>plate.id===plateId).name,plateCount:chosen.length,objectCount:new Set(objects.map(object=>JSON.stringify([object.plateId,object.native.groupId]))).size,partCount:objects.length,filamentCount:checked.filamentCount,printer:settings.printer_settings_id,process:settings.print_settings_id,profile:settings.print_settings_id,filaments:list(settings.filament_settings_id)};
    return{project:sanitized,bytes,selection,settings,effectiveSettings,context:catalog.getSettingsContext?.(effectiveSettings),summary,warnings:[...new Set(warnings)]};
  }
  const router=express.Router(),upload=multer({storage:multer.memoryStorage(),limits:{fileSize:128*1024*1024,files:1,fields:4,fieldSize:1024*1024},fileFilter:(_req,file,done)=>done(null,path.extname(file.originalname).toLowerCase()==='.3mf')});
  router.post('/import',upload.single('model'),async(req,res,next)=>{
    const controller=new AbortController(),abort=()=>{if(!res.writableFinished)controller.abort();};req.once('aborted',abort);res.once('close',abort);
    try{if(!req.file?.size)throw new Error('A native 3MF project is required');if(Object.keys(req.body).some(key=>!['selection','overrides','nativeSettings','processCorrectionDecisions'].includes(key)))throw new Error('Unsupported project import context field');res.json(await importArchive(req.file.buffer,{filename:path.basename(req.file.originalname),signal:controller.signal,...(req.body.selection&&{selection:JSON.parse(req.body.selection)}),...(req.body.overrides&&{overrides:JSON.parse(req.body.overrides)}),...(req.body.nativeSettings&&{nativeSettings:JSON.parse(req.body.nativeSettings)}),...(req.body.processCorrectionDecisions&&{processCorrectionDecisions:JSON.parse(req.body.processCorrectionDecisions)})}));}
    catch(error){error.status ||= 400;next(error);}
    finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}
  });
  router.post('/export',express.json({limit:'150mb'}),async(req,res,next)=>{try{const result=await prepare({...req.body,allPlates:req.body.allPlates!==false});const filename=(result.project.name||'Project').replace(/[^a-zA-Z0-9._-]/g,'_')+'.3mf';res.set('Cache-Control','no-store').attachment(filename).type('model/3mf').send(Buffer.from(result.bytes));}catch(error){error.status ||= 400;next(error);}});
  return{router,importArchive,prepare,prepareGeometry:(request,{signal,allowEmptyGeometry=false}={})=>prepare(request,{geometryOnly:true,allowEmptyGeometry,signal}),close:()=>nativeConfig.close()};
}
