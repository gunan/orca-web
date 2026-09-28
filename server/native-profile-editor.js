import {nativeConfigurationScope} from './native-config.js';
import {normalizeNativeProjectValues,normalizeProfileOverrides,editableDefinitionsByScope,displayedProfileSettings} from '../shared/profile-settings.js';
import {nativeVariantSchema} from '../shared/native-variants.js';
const clone=value=>structuredClone(value);
const ownScope={machine:'printer',process:'process',filament:'filament'};
const vectorKeys={machine:new Set([...nativeVariantSchema.printer_options_with_variant_1,...nativeVariantSchema.printer_options_with_variant_2]),process:new Set(nativeVariantSchema.print_options_with_variant),filament:new Set(nativeVariantSchema.filament_options_with_variant)};
const ownKeys=Object.fromEntries(Object.entries(editableDefinitionsByScope).map(([scope,definitions])=>[scope,new Set(definitions.map(definition=>definition.key))]));
export function needsNativeProfileContext(type,config){
 const variants=config?.[type==='machine'?'printer_extruder_variant':type==='process'?'print_extruder_variant':'filament_extruder_variant'];
 return Array.isArray(variants)&&variants.length>1;
}
export function nativeScopeDifference(type,base,target){
 return Object.fromEntries(Object.entries(target).filter(([key,value])=>ownKeys[type].has(key)&&JSON.stringify(value)!==JSON.stringify(base[key])).map(([key,value])=>[key,clone(value)]));
}
/** A trusted catalog chooses all source chains. HTTP input supplies only IDs,
 * native project context and schema-validated active values. */
export async function resolveNativeProfileContext({catalog,nativeConfig,type,id,selection={},projectSettings={},filamentIndex=0,scopeConfig,overrides={},signal}){
 if(!ownScope[type])throw new Error('Choose a native preset scope');
 const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 if(!plain(selection)||Object.keys(selection).some(key=>!['printerId','processId','filamentId','filamentIds'].includes(key))||Object.entries(selection).some(([key,value])=>key!=='filamentIds'&&(typeof value!=='string'||!value)))throw new Error('Invalid native profile selection');
 if(!plain(projectSettings))throw new Error('Invalid native project edit context');
 if(!Number.isInteger(filamentIndex)||filamentIndex<0||filamentIndex>=64)throw new Error('Invalid edited filament slot');
 const source=catalog.source(id,type),printerId=type==='machine'?id:selection.printerId||source.compatiblePrinterIds?.[0]||catalog.list().defaults.printerId;
 if(!printerId)throw new Error('Choose a compatible printer for native profile editing');
 const needsDefaults=!selection.processId||(!selection.filamentId&&!selection.filamentIds?.length);
 const defaults=(needsDefaults&&catalog.listResolved?await catalog.listResolved({printerId,signal}):catalog.list({printerId})).defaults,processId=type==='process'?id:selection.processId||defaults.processId;
 const filamentIds=clone(selection.filamentIds||[selection.filamentId||defaults.filamentId]);
 if(!Array.isArray(filamentIds)||!filamentIds.length||filamentIds.length>64||filamentIds.some(value=>typeof value!=='string'||!value))throw new Error('Choose 1–64 material slots for native profile editing');
 if(type==='filament'){if(filamentIndex>=filamentIds.length)throw new Error('Edited material slot is missing');filamentIds[filamentIndex]=id;}
 const targetIndex=type==='filament'?filamentIndex:0,ids={printerId,processId,filamentIds},project=normalizeNativeProjectValues(projectSettings),normalized=normalizeProfileOverrides(type,overrides);
 const virtualId='native-profile-editor-target',nativeIds=scopeConfig&&type==='filament'?{...ids,filamentIds:ids.filamentIds.map((value,index)=>index===targetIndex?virtualId:value)}:ids;
 const scopedCatalog=scopeConfig?{
  ...catalog,
  getPreset(selectedId,scope){return catalog.getPreset(selectedId===virtualId?id:selectedId,scope);},
  resolveSelection(values){return catalog.resolveSelection({...values,...(values.filamentId===virtualId?{filamentId:id}:{})});},
  getPresetSource(selectedId,scope){
   if(scope===type&&selectedId===(type==='filament'?virtualId:id)){const original=catalog.getPresetSource(id,type);return{name:original.name,metadata:original.metadata,vendor:'Local snapshot',snapshot:true,chain:[{...clone(scopeConfig),name:original.name}],vendors:['Local snapshot']};}
   return catalog.getPresetSource(selectedId,scope);
  },
 }:catalog;
 const nativeOverrides={project,...(type==='machine'?{machine:normalized}:type==='process'?{process:normalized}:{filaments:filamentIds.map((_,index)=>index===targetIndex?normalized:{})})};
 const resolved=await (nativeConfig.inspectCatalogNativeSettings||nativeConfig.resolveCatalogNativeSettings)({catalog:scopedCatalog,selection:nativeIds,overrides:nativeOverrides,signal});
 const effective=resolved.effectiveSettings,physicalNozzle=type==='filament'?Number(effective.filament_map?.[targetIndex]??1):1;
 const intactScope=type==='machine'?resolved.scopes.printer:type==='process'?resolved.scopes.process:resolved.scopes.filaments[targetIndex];
 // Process variant fields are only internal identity metadata; native full_config
 // already supplies every editable process value. Some legacy multi-nozzle
 // processes intentionally have no second metadata identity (for example J1).
 const projection=type==='process'?{editorSettings:resolved.process,editorSourceIndices:{}}:await nativeConfig.run({operation:'profile-editor-projection',scope:type,settings:intactScope,context:{nozzle_diameter:effective.nozzle_diameter,extruder_type:effective.extruder_type,nozzle_volume_type:effective.nozzle_volume_type},physicalNozzle},{signal});
 const active=nativeConfigurationScope(type,projection.editorSettings,source.name);
 const full=clone(type==='machine'?resolved.scopes.printer:type==='process'?resolved.scopes.process:resolved.scopes.filaments[targetIndex]);
 Object.assign(full,{name:source.name,type,from:'user',instantiation:'true'});
 if(type==='machine')full.printer_settings_id=source.name;else if(type==='process')full.print_settings_id=source.name;else full.filament_settings_id=[source.name];
 const settings=resolved.effectiveSettings,nozzles=settings.nozzle_diameter.length,types=settings.extruder_type||[],volumes=settings.nozzle_volume_type||[],maps=settings.filament_map||filamentIds.map(()=>1);
 const variantFields={};
 for(const key of vectorKeys[type]){
  if(!Array.isArray(active[key]))continue;
  const stride=type==='machine'&&nativeVariantSchema.printer_options_with_variant_2.includes(key)?2:1;
  const indices=active[key].map((_,index)=>{const physical=type==='filament'?Number(maps[targetIndex]??1):Math.floor(index/stride)+1;return{physicalNozzle:physical,extruderType:types[physical-1]??types[0]??'Direct Drive',nozzleVolume:volumes[physical-1]??volumes[0]??'Standard',...(type==='filament'?{filamentSlot:targetIndex+1}:{}),...(stride===2?{machineMode:index%2===0?'Normal':'Silent'}:{})};});
  variantFields[key]={fixed:true,indices};
 }
 const printerFull=resolved.scopes.printer,editorNozzles=Array.from({length:nozzles},(_,index)=>{const extruderType=types[index]??types[0]??'Direct Drive',prefix=`${extruderType} `,options=(printerFull.printer_extruder_variant||[]).flatMap((variant,variantIndex)=>Number(printerFull.printer_extruder_id?.[variantIndex]??1)===index+1&&variant.startsWith(prefix)?[variant.slice(prefix.length)]:[]);return{physicalNozzle:index+1,extruderType,nozzleVolume:volumes[index]??volumes[0]??'Standard',volumeOptions:[...new Set(options.length?options:[volumes[index]??'Standard'])]};});
 // TabFilament::update_filament_overrides_page (Tab.cpp:3810–3848) uses
 // the material variant index in the intact printer preset for inherited text.
 const inheritedFilamentValues={};
 if(type==='filament'){const index=projection.editorSourceIndices.filament_retraction_length?.[0]??0;for(const key of 'filament_retraction_length filament_z_hop filament_z_hop_types filament_retract_lift_above filament_retract_lift_below filament_retract_lift_enforce filament_retraction_speed filament_deretraction_speed filament_retract_restart_extra filament_retraction_minimum_travel filament_retract_when_changing_layer filament_wipe filament_wipe_distance filament_retract_before_wipe'.split(' ')){const value=printerFull[key.slice('filament_'.length)];if(value!==undefined)inheritedFilamentValues[key]=clone(Array.isArray(value)?value[index]??value[0]:value);}}
 const relatedSettings={printer:resolved.printer,process:resolved.process,filament:resolved.filaments[targetIndex],...{[ownScope[type]]:active}};
 const slicingDifferences=type==='machine'?[...vectorKeys.machine].filter(key=>JSON.stringify(active[key])!==JSON.stringify(resolved.printer[key])):[];
 return{relatedSettings,editorNozzles,slicingDifferences,source,selection:ids,filamentIndex:targetIndex,projectSettings:project,active,full,settings:displayedProfileSettings(type,active),variantFields,context:{...resolved.context,isGlobal:true,isPlate:false,filamentCount:filamentIds.length,projectSettings:project,filaments:resolved.filaments,inheritedFilamentValues},resolved,nozzles};
}
