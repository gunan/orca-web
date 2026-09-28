import {normalizeOverrides} from '../shared/settings.js';
import {applyNativeCorrectionDecisions} from '../shared/native-setting-corrections.js';
const keys=['filament_diameter','filament_shrink','filament_shrinkage_compensation_z'];
const list=value=>value==null?[]:Array.isArray(value)?value:[value];
/** Read-only complete material snapshot. Duplicated preset IDs share one request;
 * values are restored to slot order. Embedded vectors take precedence over any
 * displayed first-filament settings supplied by the main settings editor. */
export async function resolveLayerMaterialSettings(project,globalSettings,{signal,fetchImpl=fetch}={}){
 const snapshot=structuredClone({ids:project.ids,filamentIds:project.filamentIds,useEmbeddedSettings:project.useEmbeddedSettings,nativeSettings:project.nativeSettings,nativeContext:project.nativeContext,overrides:project.overrides||{},projectOverrides:project.projectOverrides,processCorrectionDecisions:project.processCorrectionDecisions||[]});
 let settings,context,filamentCount;
 if(snapshot.useEmbeddedSettings){if(!snapshot.nativeSettings)throw new Error('Embedded material settings are missing');settings={...globalSettings,...snapshot.nativeSettings,...normalizeOverrides(snapshot.overrides)};context=snapshot.nativeContext;filamentCount=list(settings.filament_settings_id).length;if(!filamentCount)throw new Error('Embedded filament slots are missing');}
 else{
  const ids=snapshot.filamentIds?.length?snapshot.filamentIds:[snapshot.ids?.filamentId];if(!ids.length||ids.length>64||ids.some(id=>typeof id!=='string'||!id)||!snapshot.ids?.printerId||!snapshot.ids?.processId)throw new Error('Choose complete printer, process and filament presets before previewing layers');
  const pairs=await Promise.all([...new Set(ids)].map(async filamentId=>{const params=new URLSearchParams({printerId:snapshot.ids.printerId,processId:snapshot.ids.processId,filamentId});const response=await fetchImpl(`/api/presets/selection?${params}`,{signal});let body;try{body=await response.json();}catch{throw new Error('Could not read the filament settings response');}if(!response.ok)throw new Error(body.error||`Could not resolve filament ${filamentId}`);if(!body.filamentSettings)throw new Error('The filament response has no material settings');return[filamentId,body];}));
  signal?.throwIfAborted();const responses=new Map(pairs),first=responses.get(ids[0]);settings={...globalSettings,...normalizeOverrides(snapshot.overrides),...snapshot.projectOverrides};context=first.context;filamentCount=ids.length;
  for(const key of keys)settings[key]=ids.map((id,index)=>{const value=list(responses.get(id).filamentSettings[key])[0];if(value==null)throw new Error(`Filament slot ${index+1} is missing ${key}`);return value;});
  settings.filament_settings_id=ids;
 }
 if(snapshot.processCorrectionDecisions.length){const corrected=applyNativeCorrectionDecisions({printer:settings,process:settings,filament:settings,context:{...context,isGlobal:true,isPlate:false,filamentCount,projectSettings:settings}},{scope:'process',decisions:snapshot.processCorrectionDecisions});Object.assign(settings,corrected.nativeChanges);}
 signal?.throwIfAborted();return{settings,filamentCount};
}
