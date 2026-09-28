import{createHash}from'node:crypto';
import{parseProject}from'../shared/project.js';
import{assertInstanceFamilies}from'../shared/native-instances.js';
import{nativePlateExtruders}from'../shared/native-plate-extruders.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)).digest('hex');
const transient=new Set(['activePlateId','selectedId','selectedIds','selectionScope','selectionFrame']);
/** Only a server-validated project slice can join a statistics cohort. Capture
 * all geometry/settings/metadata so edited scenes or mutable presets cannot
 * silently reuse old plate results. UI selection is the sole ignored state. */
export function snapshotNativePreviewProject(request,prepared){
 const full=parseProject(JSON.stringify(request.project)),plateId=prepared.summary.plateId,visible=full.objects.filter(object=>object.visible!==false);assertInstanceFamilies(visible);
 const plates=full.plates.filter(plate=>visible.some(object=>object.plateId===plate.id)).map(plate=>({id:plate.id,name:plate.name}));if(!plates.some(plate=>plate.id===plateId))throw new Error('Native statistics plate is not part of the project');
 const config={...(prepared.effectiveSettings||prepared.settings)};
 // prepare() selects these two vectors by plate for the engine. The complete
 // original vectors remain bound by the project/request hash below.
 if(request.useEmbeddedSettings){delete config.wipe_tower_x;delete config.wipe_tower_y;}
 const projectHash=hash({project:Object.fromEntries(Object.entries(full).filter(([key])=>!transient.has(key))),selection:request.selection||{},overrides:request.overrides||{},useEmbeddedSettings:request.useEmbeddedSettings===true,processCorrectionDecisions:request.processCorrectionDecisions||[]});
 const configHash=hash(config),extruders=nativePlateExtruders(prepared.project,prepared.effectiveSettings||prepared.settings,{plateId,fullProject:full});
 return normalizeNativePreviewProject({version:1,source:'native-editor-project',projectHash,configHash,plateId,plates,extruders});
}
export function captureNativePreviewProject(request,prepared){try{return{nativePreviewProject:snapshotNativePreviewProject(request,prepared)};}catch(error){return{nativePreviewProjectUnavailable:`All-plate native statistics are unavailable: ${error.message}`};}}
export function normalizeNativePreviewProject(value){if(!value||value.version!==1||value.source!=='native-editor-project'||!['projectHash','configHash'].every(key=>typeof value[key]==='string'&&/^[a-f0-9]{64}$/.test(value[key]))||typeof value.plateId!=='string'||!Array.isArray(value.plates)||!value.plates.length||value.plates.length>100||!Array.isArray(value.extruders)||value.extruders.length>256||new Set(value.extruders).size!==value.extruders.length||value.extruders.some(id=>!Number.isInteger(id)||id<1||id>2147483647))throw new Error('Invalid native all-plate job association');const ids=new Set();for(const plate of value.plates){if(typeof plate.id!=='string'||!plate.id.length||plate.id.length>1024||ids.has(plate.id)||typeof plate.name!=='string'||plate.name.length>4096)throw new Error('Invalid native all-plate association plates');ids.add(plate.id);}if(!ids.has(value.plateId))throw new Error('Missing native statistics plate identity');return structuredClone(value);}
export function nativePreviewProjectKey(value){const normalized=normalizeNativePreviewProject(value);return hash({projectHash:normalized.projectHash,configHash:normalized.configHash,plates:normalized.plates});}
