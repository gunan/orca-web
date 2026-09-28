import {prusaImportQueue} from './native-prusa-queue.js';
import {isPrusaProject} from '../shared/prusa-format.js';
import {applyNativeCorrectionDecisions} from '../shared/native-setting-corrections.js';
import {readFile,writeFile,mkdtemp,mkdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {XMLParser} from 'fast-xml-parser';
import {strFromU8} from 'fflate';
import {extractBoundedZip} from '../shared/import-limits.js';
import {normalizeNativeProjectValues} from '../shared/profile-settings.js';
import {decodeFacet} from '../shared/facet-painting.js';
import {validateNativeArchiveSafety,nativeSettingsFromSelection} from '../shared/native-project.js';
import {makePrusaSource,PRUSA_MODEL_KEYS} from '../shared/prusa-provenance.js';
import {projectFromPrusaModel,PRUSA_NATIVE_REVISION} from '../shared/prusa-model.js';
import {extendPrusaFilaments} from '../shared/prusa-context.js';
import {createNativeProjectService,normalizeProjectSettings} from './native-projects.js';
import {runSlicer} from './slicer.js';
export const defaultPrusaWorker=process.env.ORCA_PRUSA_IMPORTER_BIN||fileURLToPath(new URL('../native/build/prusa/orca-prusa-import',import.meta.url));
const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false}),array=value=>value==null?[]:Array.isArray(value)?value:[value];
const legacyPaint={supports:'slic3rpe:custom_supports',seam:'slic3rpe:custom_seam',color:'slic3rpe:mmu_segmentation',fuzzy:'slic3rpe:fuzzy_skin'};
export function inspectPrusaArchive(bytes){
 validateNativeArchiveSafety(bytes);const entries=extractBoundedZip(bytes),root=entries['3D/3dmodel.model'];if(!root||entries['3D/_rels/3dmodel.model.rels'])return null;
 if(!isPrusaProject(entries))return null;const parsed=parser.parse(strFromU8(root));
 const budget={nodes:0};let visits=0,triangles=0,vertices=0;function visit(value,depth=0){if(depth>100||++visits>10000000)throw new Error('Prusa model nesting or node limit exceeded');if(!value||typeof value!=='object')return;
 if(value.vertices&&value.triangles){const points=array(value.vertices.vertex),faces=array(value.triangles.triangle);vertices+=points.length;triangles+=faces.length;if(vertices>6000000||triangles>2000000)throw new Error('Prusa geometry exceeds its vertex or triangle limit');for(const point of points)for(const key of['x','y','z'])if(!Object.hasOwn(point,`@_${key}`)||!Number.isFinite(Number(point[`@_${key}`]))||Math.abs(Number(point[`@_${key}`]))>1e7)throw new Error('Invalid Prusa vertex');for(const face of faces)for(const key of['v1','v2','v3']){const index=Number(face[`@_${key}`]);if(!Object.hasOwn(face,`@_${key}`)||!Number.isInteger(index)||index<0||index>=points.length)throw new Error('Invalid Prusa triangle index');}}
 for(const[channel,attribute]of Object.entries(legacyPaint))if(value[`@_${attribute}`])decodeFacet(String(value[`@_${attribute}`]),{channel,budget});for(const child of Object.values(value))if(child&&typeof child==='object')visit(child,depth+1);}
 for(const[name,bytes]of Object.entries(entries))if(name.startsWith('3D/')&&name.endsWith('.model'))visit(name==='3D/3dmodel.model'?parsed:parser.parse(strFromU8(bytes)));
 const filteredModelSettings=[],config=entries['Metadata/Slic3r_PE_model.config'];if(config){const document=parser.parse(strFromU8(config));for(const object of array(document.config?.object)){const objectId=Number(object['@_id']);const check=(items,index)=>{for(const item of array(items)){const key=item['@_key'];if(typeof key==='string'&&!PRUSA_MODEL_KEYS.includes(key))filteredModelSettings.push({objectId,volumeIndex:item['@_type']==='object'?-1:index,key});}};check(object.metadata,-1);array(object.volume).forEach((volume,index)=>check(volume.metadata,index));}}
 const ignoredCarriers=Object.keys(entries).filter(name=>name.startsWith('Metadata/')&&!name.endsWith('/')&&name!=='Metadata/Slic3r_PE_model.config');return{entries,nativeLegacySource:makePrusaSource(entries,{ignoredCarriers,filteredModelSettings})};
}
/** Exact native GUI importer, isolated from GUI backups and user settings. */
export async function importPrusaArchive(bytes,{selection,nativeSettings:currentSettings,context,processCorrectionDecisions,filename='Project.3mf',workerPath=defaultPrusaWorker,work,signal,timeoutMs=120000,runNative=runSlicer,colorIndex=0}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('Invalid native Prusa import timeout');const deadline=Date.now()+timeoutMs;
 const inspected=inspectPrusaArchive(bytes);if(!inspected)return null;if(currentSettings&&selection)throw new Error('Choose embedded settings or catalog presets for Prusa import');if(!currentSettings&&(!selection?.printer||!selection?.process||!(selection.filament||selection.filaments?.length)))throw new Error('Prusa import needs selected printer, process and material presets');const current=currentSettings?normalizeProjectSettings(currentSettings).settings:null;
 if(!Number.isInteger(colorIndex)||colorIndex<0)throw new Error('Invalid imported material color context');const remaining=()=>{signal?.throwIfAborted();const left=deadline-Date.now();if(left<=0)throw new Error('Native Prusa import timed out');return left;};
 return prusaImportQueue.run(async()=>{
 remaining();const directory=work?path.join(work,'native-prusa'):await mkdtemp(path.join(tmpdir(),'orca-prusa-import-'));if(work)await mkdir(directory);const owned=!work;
 try{
  remaining();const binary=path.resolve(workerPath),version=await runNative(binary,['--version'],{cwd:directory,signal,timeoutMs:remaining()});if(version.trim()!==`OrcaPrusaImporter-2.4.2 revision${PRUSA_NATIVE_REVISION}`)throw new Error('Prusa importer must use the pinned OrcaSlicer2.4.2 source');
  const input=path.join(directory,path.basename(filename).replace(/[^A-Za-z0-9._-]/g,'_').slice(-150)||'source.3mf'),output=path.join(directory,'imported.json');await writeFile(input,bytes);await runNative(binary,[input,output],{cwd:directory,signal,timeoutMs:remaining()});remaining();if((await stat(output)).size>150*1024*1024)throw new Error('Native Prusa output exceeds150MB');const data=JSON.parse(await readFile(output,'utf8'));
  const base=current||{...nativeSettingsFromSelection(selection),...normalizeNativeProjectValues(selection.project||{})};
  const originalCount=base.filament_settings_id?.length,nativeSettings=extendPrusaFilaments(base,data.requiredFilamentCount,{colorIndex});
  if(processCorrectionDecisions!==undefined){const applied=applyNativeCorrectionDecisions({printer:nativeSettings,process:nativeSettings,filament:nativeSettings,context:{...(context||selection?.context),isGlobal:true,isPlate:false,filamentCount:nativeSettings.filament_settings_id.length,projectSettings:nativeSettings}},{scope:'process',decisions:processCorrectionDecisions});Object.assign(nativeSettings,applied.nativeChanges);}
  const project=projectFromPrusaModel(data,{name:path.basename(filename,path.extname(filename)),nativeSettings,nativeLegacySource:inspected.nativeLegacySource,ids:selection?.ids});
  const prepared=await createNativeProjectService({catalog:{getSettingsContext:()=>context||selection?.context}}).prepare({project,useEmbeddedSettings:true});remaining();
  return{...prepared,warnings:[...new Set([...project.nativeImportWarnings,...prepared.warnings])],nativeImport:{format:'prusa-3mf',importer:'OrcaPrusaImporter-2.4.2',sourceRevision:PRUSA_NATIVE_REVISION,addedFilamentSlots:nativeSettings.filament_settings_id.length-originalCount,warnings:project.nativeImportWarnings}};
 }finally{if(owned)await rm(directory,{recursive:true,force:true});}
 },{signal,deadline});
}
