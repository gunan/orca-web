import schema from './native-project-schema.json' with {type:'json'};
export const PURGE_LIMITS=Object.freeze({filaments:64,nozzles:64,cells:64**3,bytes:4*1024*1024,displayVolume:20000,multiplier:3});
const defaults=Object.fromEntries(schema.options.filter(item=>['flush_multiplier','flush_volumes_vector','flush_volumes_matrix'].includes(item.key)).map(item=>[item.key,item.default.map(String)]));
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((value,i)=>Number(value)===Number(b[i]));
function count(value,label,max){if(!Number.isInteger(value)||value<1||value>max)throw new Error(`Invalid ${label} count`);return value;}
function vector(values,label,maxLength){if(!Array.isArray(values)||values.length>maxLength||values.some(value=>!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))))throw new Error(`Invalid ${label}`);return values.map(String);}
export function physicalNozzleCount(settings={}){const values=settings.nozzle_diameter;if(values===undefined)return 1;return count(Array.isArray(values)?values.length:1,'physical nozzle',PURGE_LIMITS.nozzles);}
/** PrintConfig::get_flush_volumes_matrix: each physical nozzle owns one entire
 * row-major filament-square matrix. Multipliers are not baked into its values. */
export function normalizePurgeSettings(settings,filaments,{nozzles=physicalNozzleCount(settings),allowNativeDefaults=true}={}){
 count(filaments,'filament',PURGE_LIMITS.filaments);count(nozzles,'physical nozzle',PURGE_LIMITS.nozzles);
 const length=filaments*filaments*nozzles;
 let matrix=settings.flush_volumes_matrix;
 if(matrix===undefined||(allowNativeDefaults&&Array.isArray(matrix)&&matrix.length!==length&&same(matrix,defaults.flush_volumes_matrix)))matrix=Array.from({length},(_,i)=>String(Math.floor(i/filaments)%filaments===i%filaments?0:280));
 matrix=vector(matrix,'per-nozzle purging matrix',PURGE_LIMITS.cells);
 if(matrix.length!==length)throw new Error(`Purging matrix needs ${nozzles} physical nozzle table(s) of ${filaments} × ${filaments} values`);
 let loadUnload=settings.flush_volumes_vector;
 if(loadUnload===undefined||(allowNativeDefaults&&Array.isArray(loadUnload)&&loadUnload.length!==filaments*2&&same(loadUnload,defaults.flush_volumes_vector)))loadUnload=Array(filaments*2).fill('140');
 loadUnload=vector(loadUnload,'purging load/unload vector',PURGE_LIMITS.filaments*2);if(loadUnload.length!==filaments*2)throw new Error('Purging vector needs load/unload values for every filament slot');
 let multipliers=vector(settings.flush_multiplier===undefined?defaults.flush_multiplier:settings.flush_multiplier,'flush multipliers',PURGE_LIMITS.nozzles);
 // Native BuildTableObjStr uses std::vector::resize(nozzleCount,1).
 if(!multipliers.length)throw new Error('At least one flush multiplier is required');
 if(multipliers.length>nozzles)throw new Error('Flush multiplier count exceeds physical nozzles');
 while(multipliers.length<nozzles)multipliers.push('1');
 if(new TextEncoder().encode(JSON.stringify(matrix)).length>PURGE_LIMITS.bytes)throw new Error('Purging matrix exceeds its 4 MiB limit');
 return{flush_volumes_matrix:matrix,flush_volumes_vector:loadUnload,flush_multiplier:multipliers};
}
/** Preserve old cells for every nozzle; new transitions use the per-material
 * load/unload pair, matching PresetBundle::update_multi_material_filament_presets.
 * indices are old material indexes or null for newly appended materials. */
export function resizePurgeSettings(settings,oldCount,indices,{nozzles=physicalNozzleCount(settings),oldNozzles=nozzles}={}){
 if(!Array.isArray(indices))throw new Error('Invalid purge material remapping');
 const source=normalizePurgeSettings(settings,oldCount,{nozzles:oldNozzles}),countNew=count(indices?.length,'filament',PURGE_LIMITS.filaments);count(nozzles,'physical nozzle',PURGE_LIMITS.nozzles);
 if(indices.some(index=>index!==null&&(!Number.isInteger(index)||index<0||index>=oldCount))||new Set(indices.filter(index=>index!==null)).size!==indices.filter(index=>index!==null).length)throw new Error('Invalid purge material remapping');
 const vectorNew=indices.flatMap(index=>index===null?source.flush_volumes_vector.slice(0,2):source.flush_volumes_vector.slice(index*2,index*2+2));
 const matrix=Array.from({length:nozzles*countNew*countNew},(_,offset)=>{const nozzle=Math.floor(offset/(countNew*countNew)),row=Math.floor(offset/countNew)%countNew,column=offset%countNew,from=indices[row],to=indices[column];return nozzle<oldNozzles&&from!==null&&to!==null?source.flush_volumes_matrix[nozzle*oldCount*oldCount+from*oldCount+to]:String(row===column?0:Number(vectorNew[row*2])+Number(vectorNew[column*2+1]));});
 return{flush_volumes_matrix:matrix,flush_volumes_vector:vectorNew,flush_multiplier:Array.from({length:nozzles},(_,i)=>source.flush_multiplier[i]??'1')};
}
export function purgeDisplayValue(raw,multiplier){return Math.min(PURGE_LIMITS.displayVolume,Math.max(0,Math.round(Number(raw)*Number(multiplier))));}
export function purgeRawValue(display,multiplier){if(!Number.isFinite(Number(display))||Number(display)<0||Number(display)>PURGE_LIMITS.displayVolume||!Number.isFinite(Number(multiplier))||Number(multiplier)<0||Number(multiplier)>PURGE_LIMITS.multiplier)throw new Error('Invalid flushing volume or multiplier');return String(Number(multiplier)===0?0:Math.round(Number(display)/Number(multiplier)));}
