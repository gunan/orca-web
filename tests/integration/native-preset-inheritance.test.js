import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createPresetCatalog} from '../../server/presets.js';
import {createCustomPresetCatalog} from '../../server/custom-presets.js';
import {createNativeConfigurationService} from '../../server/native-config.js';
async function fixture(t,wrap=value=>value){
 const dataDir=await mkdtemp(path.join(tmpdir(),'orca-native-inheritance-')),baseCatalog=await createPresetCatalog({profilesDir:path.resolve('tests/fixtures/presets')});
 const service=wrap(createNativeConfigurationService()),catalog=await createCustomPresetCatalog({baseCatalog,dataDir,nativeConfig:service});
 t.after(async()=>{await catalog.close();await rm(dataDir,{recursive:true,force:true});});
 return{dataDir,baseCatalog,catalog,defaults:catalog.list().defaults};
}
test('native import stores original user diff and editor reset resolves the native parent rather than imported child',{timeout:30000},async t=>{
 const c=await fixture(t),parent=c.catalog.getPreset(c.defaults.processId,'process');
 const document={type:'process',name:'Inherited fine',inherits:parent.name,layer_height:'0.12',version:'2.3.0.0'};
 const child=await c.catalog.importPreset({preset:document});
 assert.equal(child.nativeInheritanceMode,true);assert.equal(child.preset.layer_height,'0.12');assert.equal(child.nativeParent,parent.name);
 assert.equal(c.catalog.exportPreset(child.id).inherits,parent.name);assert.equal(c.catalog.exportPreset(child.id).version,'2.3.0.0');assert.equal(c.catalog.exportPreset(child.id).wall_loops,undefined);
 const context=await c.catalog.sourceContext(child.id,'process',{selection:c.defaults});
 assert.equal(context.baseSettings.layer_height,'0.2');assert.equal(context.settings.layer_height,'0.12');assert.equal(context.overrides.layer_height,'0.12');
 const reset=await c.catalog.saveCustom({settings:{},nativeEditor:true,selection:c.defaults},child.id);
 assert.equal(reset.preset.layer_height,'0.2');assert.equal(c.catalog.exportPreset(child.id).layer_height,undefined);assert.equal(c.catalog.exportPreset(child.id).inherits,parent.name);
 const reopened=await createCustomPresetCatalog({dataDir:c.dataDir,baseCatalog:c.baseCatalog});t.after(()=>reopened.close());assert.equal(reopened.getCustom(child.id).preset.layer_height,'0.2');
});
test('root edit reloads direct native children while reopening resolves their nullable variant differences',{timeout:30000},async t=>{
 const c=await fixture(t),printer=c.catalog.getPreset(c.defaults.printerId,'machine');
 const root=await c.catalog.importPreset({preset:{type:'filament',name:'Root material',filament_type:['PLA'],nozzle_temperature:['215','225'],filament_extruder_variant:['Direct Drive Standard','Direct Drive High Flow'],filament_retraction_length:['0.8','1.2'],compatible_printers:[printer.name]}});
 const child=await c.catalog.importPreset({preset:{type:'filament',name:'Child material',inherits:root.name,filament_extruder_variant:['Direct Drive Standard','Direct Drive High Flow'],filament_retraction_length:['nil','0.9']}});
 assert.deepEqual(child.preset.filament_retraction_length,['0.8','0.9']);
 const context=await c.catalog.sourceContext(root.id,'filament',{selection:{...c.defaults,filamentId:root.id}});
 await c.catalog.saveCustom({nativeEditor:true,settings:{...context.overrides,filament_retraction_length:['0.7']},selection:{...c.defaults,filamentId:root.id}},root.id);
 assert.deepEqual(c.catalog.getCustom(child.id).preset.filament_retraction_length,['nil','0.9']);
 const reopened=await createCustomPresetCatalog({dataDir:c.dataDir,baseCatalog:c.baseCatalog});t.after(()=>reopened.close());assert.deepEqual(reopened.getCustom(child.id).preset.filament_retraction_length,['0.7','0.9']);
 await assert.rejects(c.catalog.deleteCustom(root.id),failure=>failure.status===409);
 await assert.rejects(c.catalog.saveCustom({name:'Renamed root'},root.id),failure=>failure.status===409);
 assert.equal(c.catalog.getCustom(root.id).name,'Root material');
});
test('native parent cycles and helper failure do not overwrite persisted user diffs',{timeout:30000},async t=>{
 const c=await fixture(t),root=await c.catalog.importPreset({preset:{type:'process',name:'Parent process',layer_height:'0.2'}}),child=await c.catalog.importPreset({preset:{type:'process',name:'Child process',inherits:root.name,layer_height:'0.12'}});
 const file=path.join(c.dataDir,'presets/custom-presets.json'),before=await readFile(file,'utf8');
 const failed=createNativeConfigurationService({workerPath:path.join(c.dataDir,'missing-helper')});
 await assert.rejects(createCustomPresetCatalog({baseCatalog:c.baseCatalog,dataDir:c.dataDir,nativeConfig:failed}),failure=>failure.status===503);await failed.close();assert.equal(await readFile(file,'utf8'),before);
 const rows=JSON.parse(before),parentRow=rows.find(row=>row.id===root.id);parentRow.nativeParent=child.name;parentRow.nativeDocument.inherits=child.name;await writeFile(file,JSON.stringify(rows));
 const cyclic=createNativeConfigurationService();await assert.rejects(createCustomPresetCatalog({baseCatalog:c.baseCatalog,dataDir:c.dataDir,nativeConfig:cyclic}),/Cyclic native/);await cyclic.close();assert.equal(await readFile(file,'utf8'),JSON.stringify(rows));
});

test('failure while reloading a root child leaves the entire save transaction and disk file unchanged',{timeout:30000},async t=>{
 let fail=false;
 const c=await fixture(t,service=>({...service,run(request,options){if(fail&&request.mode==='reload')throw Object.assign(new Error('Injected child reload failure'),{status:503});return service.run(request,options);}}));
 const root=await c.catalog.importPreset({preset:{type:'process',name:'Atomic parent',layer_height:'0.2'}}),child=await c.catalog.importPreset({preset:{type:'process',name:'Atomic child',inherits:root.name,wall_loops:'4'}});
 const file=path.join(c.dataDir,'presets/custom-presets.json'),before=await readFile(file,'utf8');fail=true;
 await assert.rejects(c.catalog.saveCustom({settings:{layer_height:'0.12'},nativeEditor:true,selection:c.defaults},root.id),failure=>failure.status===503&&/child reload/.test(failure.message));
 assert.equal(await readFile(file,'utf8'),before);assert.equal(c.catalog.getCustom(root.id).preset.layer_height,'0.2');assert.equal(c.catalog.getCustom(child.id).preset.layer_height,'0.2');
});
test('native derived edits do not eagerly reload grandchildren; a restart applies their stored native diffs',{timeout:30000},async t=>{
 const c=await fixture(t),root=await c.catalog.importPreset({preset:{type:'process',name:'Root process',layer_height:'0.2'}}),child=await c.catalog.importPreset({preset:{type:'process',name:'Middle process',inherits:root.name,layer_height:'0.18'}}),leaf=await c.catalog.importPreset({preset:{type:'process',name:'Leaf process',inherits:child.name,wall_loops:'4'}});
 await c.catalog.saveCustom({settings:{layer_height:'0.12'},nativeEditor:true,selection:c.defaults},child.id);
 assert.equal(c.catalog.getCustom(leaf.id).preset.layer_height,'0.18');
 const reopened=await createCustomPresetCatalog({dataDir:c.dataDir,baseCatalog:c.baseCatalog});t.after(()=>reopened.close());assert.equal(reopened.getCustom(leaf.id).preset.layer_height,'0.12');
 const clone=await c.catalog.saveCustom({type:'process',name:'Native sibling',baseId:child.id,settings:{},selection:c.defaults});assert.equal(clone.nativeInheritanceMode,true);assert.equal(clone.nativeParent,root.name);assert.equal(c.catalog.exportPreset(clone.id).inherits,root.name);
});
test('native-mode names follow portable reserved-name rules and root machine save retains only allowed settings',{timeout:30000},async t=>{
 const c=await fixture(t),printer=c.catalog.getPreset(c.defaults.printerId,'machine');
 const root=await c.catalog.importPreset({preset:{...printer,name:'Root printer',inherits:''}});
 for(const name of ['Bad/name','Bad:name','Default Printer','Trailing '])await assert.rejects(c.catalog.saveCustom({name,selection:c.defaults},root.id),/native preset name/);
 const saved=await c.catalog.saveCustom({settings:{z_offset:'0.15'},nativeEditor:true,selection:c.defaults},root.id);assert.equal(saved.preset.z_offset,'0.15');
 const exported=c.catalog.exportPreset(root.id);assert.equal(exported.inherits,'');assert.equal(exported.z_offset,'0.15');assert.equal(exported.type,'machine');
});
