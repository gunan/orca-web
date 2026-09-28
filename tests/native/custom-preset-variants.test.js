import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
import {createPresetCatalog} from '../../server/presets.js';
import {createCustomPresetCatalog} from '../../server/custom-presets.js';
import {resolveCatalogNativeSettings} from '../../server/native-config.js';
import {createNativeProjectService} from '../../server/native-projects.js';
import {importNative3MF} from '../../shared/native-project.js';
import {dropToBed,meshBounds} from '../../shared/geometry.js';
import {runSlicer} from '../../server/slicer.js';
const binary=process.env.ORCA_SLICER_BIN||'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer';
const base=await createPresetCatalog({binary});
async function setup(t){const directory=await mkdtemp(path.join(tmpdir(),'orca-custom-variants-')),catalog=await createCustomPresetCatalog({baseCatalog:base,dataDir:directory});t.after(async()=>{await catalog.close();await rm(directory,{recursive:true,force:true});});const printer=catalog.list().printers.find(item=>item.name==='Bambu Lab H2D 0.4 nozzle');assert.ok(printer);const ids=catalog.list({printerId:printer.id}).defaults;return{catalog,directory,ids};}
const standard={nozzle_volume_type:['Standard','High Flow'],filament_map:['1']},high={nozzle_volume_type:['High Flow','Standard'],filament_map:['1']};
async function material(api,name='Independent native material'){
 return api.catalog.saveCustom({type:'filament',name,baseId:api.ids.filamentId,settings:{filament_max_volumetric_speed:['27']},selection:api.ids,projectSettings:standard,compatiblePrinterIds:[api.ids.printerId]});
}
test('custom material active edits, reset, clone and reload preserve inactive native variants and selected slot identity',{timeout:120000},async t=>{
 const api=await setup(t),{catalog,ids}=api;assert.deepEqual(catalog.getPreset(ids.filamentId,'filament').filament_max_volumetric_speed,['25','40']);
 let saved=await material(api);assert.deepEqual(saved.preset.filament_max_volumetric_speed,['27','40']);
 saved=await catalog.saveCustom({settings:{filament_max_volumetric_speed:['43']},selection:ids,projectSettings:high,nativeEditor:true},saved.id);assert.deepEqual(saved.preset.filament_max_volumetric_speed,['27','43']);
 const two={...ids,filamentIds:[saved.id,saved.id]},projectSettings={nozzle_volume_type:['Standard','High Flow'],filament_map:['1','2']};
 const first=await catalog.sourceContext(saved.id,'filament',{selection:two,projectSettings,filamentIndex:0}),second=await catalog.sourceContext(saved.id,'filament',{selection:two,projectSettings,filamentIndex:1});assert.deepEqual(first.preset.filament_max_volumetric_speed,['27']);assert.deepEqual(second.preset.filament_max_volumetric_speed,['43']);assert.equal(second.variantFields.filament_max_volumetric_speed.indices[0].physicalNozzle,2);
 saved=await catalog.saveCustom({settings:{filament_max_volumetric_speed:['44']},selection:two,projectSettings,filamentIndex:1,nativeEditor:true},saved.id);assert.deepEqual(saved.preset.filament_max_volumetric_speed,['27','44']);
 saved=await catalog.saveCustom({settings:{},selection:ids,projectSettings:standard,nativeEditor:true},saved.id);assert.deepEqual(saved.preset.filament_max_volumetric_speed,['25','44']);
 const cloned=await catalog.saveCustom({type:'filament',name:'Variant child',baseId:saved.id,settings:{filament_max_volumetric_speed:['29']},compatiblePrinterIds:[ids.printerId],selection:ids,projectSettings:standard});assert.deepEqual(cloned.preset.filament_max_volumetric_speed,['29','44']);assert.deepEqual(catalog.getPreset(saved.id,'filament').filament_max_volumetric_speed,['25','44']);
 const reopened=await createCustomPresetCatalog({baseCatalog:base,dataDir:api.directory});t.after(()=>reopened.close());assert.deepEqual(reopened.exportPreset(cloned.id).filament_max_volumetric_speed,['29','44']);const resolved=await resolveCatalogNativeSettings({catalog:reopened,selection:{...ids,filamentIds:[cloned.id,cloned.id]},overrides:{project:projectSettings}});assert.deepEqual(resolved.archiveSettings.filament_max_volumetric_speed,['29','44','29','44']);assert.deepEqual(resolved.effectiveSettings.filament_max_volumetric_speed,['29','44']);
});
test('custom H2D machine active nozzle and normal/silent edits preserve all other native alternatives',{timeout:120000},async t=>{
 const {catalog,ids}=await setup(t),context={selection:ids,projectSettings:standard,nativeEditor:true};
 const source=await catalog.sourceContext(ids.printerId,'machine',{selection:ids,projectSettings:standard});assert.equal(source.variantFields.machine_max_speed_x.indices.length,4);assert.equal(source.variantFields.machine_max_speed_x.indices[1].machineMode,'Silent');
 const singletonContext=await catalog.sourceContext(ids.printerId,'machine',{selection:ids});assert.deepEqual(singletonContext.editorContext.nozzleVolumeTypes,['Standard','Standard']);
 const original=await resolveCatalogNativeSettings({catalog,selection:ids,overrides:{project:standard}});
 const saved=await catalog.saveCustom({type:'machine',name:'Variant H2D machine',baseId:ids.printerId,settings:{retraction_length:['0.6','0.9'],machine_max_speed_x:['400','300','450','350']},...context});
 assert.deepEqual(saved.preset.retraction_length,['0.6','0.8','0.8','0.9']);
 const expected=[...original.scopes.printer.machine_max_speed_x];expected.splice(0,2,'400','300');expected.splice(6,2,'450','350');assert.deepEqual(saved.preset.machine_max_speed_x,expected);
 const active=await catalog.sourceContext(saved.id,'machine',{selection:{...ids,printerId:saved.id},projectSettings:standard});assert.deepEqual(active.preset.retraction_length,['0.6','0.9']);assert.deepEqual(active.preset.machine_max_speed_x,['400','300','450','350']);assert.ok(active.editorContext.slicingDifferences.includes('machine_max_speed_x'));
 // Native full_config(true) collapses metadata before its stride-two projection.
 const sliceConfiguration=await resolveCatalogNativeSettings({catalog,selection:{...ids,printerId:saved.id},overrides:{project:standard}});assert.deepEqual(sliceConfiguration.effectiveSettings.machine_max_speed_x,['400','300','1000','1000']);
});
test('actual native slice and re-export retain a saved material’s complete variants while using its selected limits',{timeout:120000},async t=>{
 const api=await setup(t);let saved=await material(api);saved=await api.catalog.saveCustom({settings:{filament_max_volumetric_speed:['43']},selection:api.ids,projectSettings:high,nativeEditor:true},saved.id);
 const project=importNative3MF(await readFile(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url))),original=project.objects[0],bounds=meshBounds({...original,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});original.positions=original.positions.map((value,index)=>value-bounds.min[index%3]);project.objects=[1,2].map((slot,index)=>dropToBed({...structuredClone(original),id:`body-${slot}`,name:`Custom material ${slot}`,position:[60+25*index,70,0],scale:[.5,.5,.03],filamentSlot:slot,native:{groupId:`group-${slot}`,objectName:`Custom material ${slot}`,partType:'normal_part',objectSettings:{extruder:String(slot)},partSettings:{}}}));
 project.plates=project.plates.map(plate=>({...plate,native:{metadata:{filament_map_mode:'Manual',filament_map:'1 2'}}}));
 const projects=createNativeProjectService({catalog:api.catalog});t.after(()=>projects.close());const prepared=await projects.prepare({project,selection:{...api.ids,filamentIds:[saved.id,saved.id]},overrides:{process:{layer_height:'.2',initial_layer_print_height:'.2',enable_prime_tower:false,skirt_loops:0,brim_type:'no_brim'},project:{nozzle_volume_type:['Standard','High Flow'],filament_map:['1','2'],filament_map_mode:'Manual'}}});
 assert.deepEqual(prepared.settings.filament_max_volumetric_speed,['27','43','27','43']);assert.deepEqual(prepared.effectiveSettings.filament_max_volumetric_speed,['27','43']);
 const work=path.join(api.directory,'slice');await mkdir(work);await mkdir(path.join(work,'config'));await mkdir(path.join(work,'output'));await writeFile(path.join(work,'model.3mf'),prepared.bytes);
 await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(work,'config'),'--outputdir',path.join(work,'output'),'--export-3mf','saved.3mf',path.join(work,'model.3mf')],{cwd:work,timeoutMs:120000,signal:t.signal});
 const files=await readdir(path.join(work,'output')),gcode=await readFile(path.join(work,'output',files.find(file=>file.endsWith('.gcode'))),'utf8');assert.ok(gcode.split('\n').filter(line=>/^G[0123]\s/.test(line)).length>500);const setting=gcode.match(/^; filament_max_volumetric_speed = (.+)$/m)?.[1];assert.ok(setting);assert.deepEqual(setting.split(/[;,]/).map(Number),[27,43]);const reexport=importNative3MF(await readFile(path.join(work,'output','saved.3mf')));assert.deepEqual(reexport.nativeSettings.filament_max_volumetric_speed,['27','43','27','43']);
});
test('native variant correction replay changes only the reviewed active material and rejects wrong edit dimensions',{timeout:120000},async t=>{
 const {catalog,ids}=await setup(t),input={type:'filament',name:'Native corrected variant',baseId:ids.filamentId,settings:{filament_max_volumetric_speed:['.2']},selection:ids,projectSettings:high,compatiblePrinterIds:[ids.printerId],nativeEditor:true};
 const preparation=await catalog.prepareCustomResolved(input);assert.equal(preparation.ready,false);assert.ok(preparation.plan.groups.length);
 await assert.rejects(()=>catalog.saveCustom(input),error=>error.status===409);assert.equal(catalog.listCustom().length,0);
 const decisions=preparation.plan.groups.map(group=>({id:group.id,signature:group.signature,choice:'apply'})),saved=await catalog.saveCustom({...input,correctionBatches:[decisions]});assert.deepEqual(saved.preset.filament_max_volumetric_speed,['25','0.5']);
 await assert.rejects(()=>catalog.saveCustom({settings:{filament_max_volumetric_speed:['27','43']},selection:ids,projectSettings:standard,nativeEditor:true},saved.id),/requires 1 values/);assert.deepEqual(catalog.getPreset(saved.id,'filament').filament_max_volumetric_speed,['25','0.5']);
 const context=await catalog.sourceContext(saved.id,'filament',{selection:ids,projectSettings:high});assert.deepEqual(context.baseSettings.filament_max_volumetric_speed,['40']);assert.deepEqual(context.overrides.filament_max_volumetric_speed,['0.5']);
});

import{evaluateSettingsState}from'../../shared/settings-dependencies.js';
test('native selected material inherits the intact source variant value with separate physical nozzle context',{timeout:120000},async t=>{
 const {catalog,ids}=await setup(t);const printer=await catalog.saveCustom({type:'machine',name:'Independent native retractions',baseId:ids.printerId,selection:ids,nativeEditor:true,projectSettings:high,settings:{retraction_length:['1.3','1.7']}});
 const selection={...ids,printerId:printer.id,filamentIds:[ids.filamentId,ids.filamentId]},view=await catalog.sourceContext(ids.filamentId,'filament',{selection,filamentIndex:1,projectSettings:{nozzle_volume_type:['Standard','High Flow'],filament_map:['1','2']}});
 assert.deepEqual(printer.preset.retraction_length,['0.8','1.3','1.7','0.8']);assert.equal(view.context.inheritedFilamentValues.filament_retraction_length,'1.3');assert.equal(view.variantFields.filament_retraction_length.indices[0].physicalNozzle,2);
 const state=evaluateSettingsState({...view.relatedSettings,filament:{...view.relatedSettings.filament,filament_retraction_length:['nil']},context:view.context});assert.equal(state.fields.filament.filament_retraction_length.indices[0].inheritedValue,'1.3');
});

test('default, H2D and legacy J1 contexts open all native scopes and J1 process saves retain native identity metadata',{timeout:120000},async t=>{
 const {catalog}=await setup(t);for(const name of [catalog.list().printers.find(item=>item.id===catalog.list().defaults.printerId).name,'Bambu Lab H2D 0.4 nozzle','Snapmaker J1 (0.4 nozzle)']){const printer=catalog.list().printers.find(item=>item.name===name),ids=catalog.list({printerId:printer.id}).defaults;for(const type of ['machine','process','filament']){const key={machine:'printerId',process:'processId',filament:'filamentId'}[type],view=await catalog.sourceContext(ids[key],type,{selection:ids});assert.equal(view.type,type);assert.equal(view.nativeEditor,true);assert.ok(view.editorContext.nozzleCount>0);}if(name.startsWith('Snapmaker')){const saved=await catalog.saveCustom({type:'process',name:'Native legacy process',baseId:ids.processId,selection:ids,compatiblePrinterIds:[ids.printerId],settings:{outer_wall_speed:'71'},nativeEditor:true});assert.equal(saved.preset.outer_wall_speed,'71');const active=await catalog.sourceContext(saved.id,'process',{selection:{...ids,processId:saved.id}});assert.equal(active.settings.outer_wall_speed,'71');}}
});
