import {prepareRaw3MFShrinkageWarmup} from './raw3mf-shrinkage.js';
import {readFile,readdir,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {parseModel} from '../src/model-loader.js';
import {createMesh,sceneBounds,transformPositions} from '../shared/geometry.js';
import {emptyProject} from '../shared/project.js';
import {nativeSettingsFromSelection} from '../shared/native-project.js';
import {createNativeProjectService} from './native-projects.js';
import {prepareShrinkageWarmup} from './shrinkage-warmup.js';

export function legacyNeedsShrinkageInitialization(selection,engineVersion){
  if(engineVersion!=='OrcaSlicer-2.4.2')return false;
  return ['filament_shrink','filament_shrinkage_compensation_z'].some(key=>{const raw=selection?.filament?.[key],value=Array.isArray(raw)?raw[0]:raw;return value!==undefined&&Number(String(value).replace(/%$/,''))!==100;});
}
/** Single uploaded STL/OBJ is one native model object. OBJ submeshes are kept
 * in their file coordinates and joined without union, matching raw file import.
 * Native raw input always drops the model to the bed even with arrange disabled. */
export async function legacyProjectFromMeshes(models,selection,{name='Model'}={}){
  if(!models.length)throw new Error('Legacy model has no triangles');
  const bounds=sceneBounds(models),positions=[];
  for(const model of models){const values=transformPositions(model);for(let offset=0;offset<values.length;offset++)positions.push(values[offset]-(offset%3===2?bounds.min[2]:0));}
  const object=createMesh({name,positions,plateId:'plate-1',filamentSlot:1}),project={...emptyProject(),name,objects:[object],selectedId:object.id,useEmbeddedSettings:true,nativeSettings:nativeSettingsFromSelection(selection)};
  return createNativeProjectService({catalog:{getSettingsContext:()=>selection.context}}).prepare({project,useEmbeddedSettings:true});
}
/** Called inside the cancellable queued job. The native exporter supplies the
 * actual automatic placement when the legacy caller did not preserve XY. */
export async function prepareLegacyShrinkageWarmup({input,selection,engineVersion,preservePosition,binary,work,printerPath,profilePath,filamentPath,signal,runNative,timeoutMs}){
  const extension=path.extname(input).toLowerCase();
  if(extension==='.3mf')return prepareRaw3MFShrinkageWarmup({input,engineVersion,binary,work,printerPath,profilePath,filamentPath,signal,runNative,timeoutMs});
  if(!legacyNeedsShrinkageInitialization(selection,engineVersion))return null;
  if(!['.stl','.obj'].includes(extension))throw new Error('Legacy shrinkage initialization requires STL, OBJ or 3MF');
  signal?.throwIfAborted();let paths=[input];
  if(!preservePosition){
    const output=path.join(work,'native-placement');await mkdir(output);await mkdir(path.join(output,'config'));
    const args=['--export-stl','--arrange','1','--orient','0','--outputdir',output,'--datadir',path.join(output,'config')];
    const settings=[printerPath,profilePath].filter(Boolean);if(settings.length)args.push('--load-settings',settings.join(';'));if(filamentPath)args.push('--load-filaments',filamentPath);args.push(path.resolve(input));
    await runNative(binary,args,{cwd:output,signal,timeoutMs});
    const directory=path.join(output,'stl');let files;try{files=await readdir(directory);}catch{throw new Error('Native placement produced no STL geometry');}
    paths=files.filter(file=>file.toLowerCase().endsWith('.stl')).map(file=>path.join(directory,file));if(!paths.length||paths.length>1000)throw new Error('Native placement produced an unsupported number of meshes');
  }
  const models=[];let totalBytes=0,totalTriangles=0;
  for(const file of paths){signal?.throwIfAborted();const size=(await stat(file)).size;totalBytes+=size;if(totalBytes>128*1024*1024)throw new Error('Legacy geometry exceeds its 128 MB conversion limit');const bytes=await readFile(file);const objects=await parseModel(bytes,path.basename(file),{place:false});totalTriangles+=objects.reduce((sum,object)=>sum+object.positions.length/9,0);if(totalTriangles>2000000)throw new Error('Legacy geometry exceeds its two million triangle conversion limit');models.push(...objects);}
  const prepared=await legacyProjectFromMeshes(models,selection,{name:path.basename(input,extension)});signal?.throwIfAborted();
  return prepareShrinkageWarmup({...prepared,engineVersion});
}
