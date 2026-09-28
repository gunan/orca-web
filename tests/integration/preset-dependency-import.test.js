import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {normalizeProjectSettings} from '../../server/native-projects.js';
import {exportNative3MF,importNative3MF} from '../../shared/native-project.js';
import {createPresetCatalog} from '../../server/presets.js';import {createCustomPresetCatalog} from '../../server/custom-presets.js';import {createNativeConfigurationService} from '../../server/native-config.js';import {writeCompatibilityCatalog} from '../fixtures/compatibility-catalog.js';
async function setup(t){const root=await mkdtemp(path.join(tmpdir(),'orca-dependency-import-'));await writeCompatibilityCatalog(path.join(root,'profiles'));const baseCatalog=await createPresetCatalog({profilesDir:path.join(root,'profiles')}),service=createNativeConfigurationService(),catalog=await createCustomPresetCatalog({baseCatalog,dataDir:root,nativeConfig:service});t.after(async()=>{await catalog.close();await rm(root,{recursive:true,force:true});});const ids=baseCatalog.list().defaults;return{root,baseCatalog,service,catalog,ids,base:baseCatalog.getPreset(ids.filamentId,'filament')};}
test('native JSON dependencies preserve explicit lists, dormant expressions and unknown names across persistence/export',{timeout:30000},async t=>{
 const {catalog,root,baseCatalog,service,base}=await setup(t),nativeCompatibility={compatible_printers:['External printer','External printer'],compatible_printers_condition:'printer_model == "Unknown"',compatible_prints:['External process'],compatible_prints_condition:'layer_height < 0.15'};
 const imported=await catalog.importPreset({preset:{type:'filament',name:'External dependencies',inherits:base.name,...nativeCompatibility}});assert.deepEqual(imported.nativeCompatibility,nativeCompatibility);assert.deepEqual(imported.compatiblePrinterIds,[]);const inspection=await catalog.sourceContext(imported.id,'filament',{});assert.ok(inspection.compatibilityResults.some(item=>item.name===imported.name&&!item.compatible));
 const exported=catalog.exportPreset(imported.id);for(const[key,value]of Object.entries(nativeCompatibility))assert.deepEqual(exported[key],value);
 const reopened=await createCustomPresetCatalog({baseCatalog,dataDir:root,nativeConfig:service});assert.deepEqual(reopened.getCustom(imported.id).nativeCompatibility,nativeCompatibility);
 await assert.rejects(catalog.importPreset({preset:{...exported,name:'Ambiguous dependencies'},compatiblePrinterIds:[baseCatalog.list().defaults.printerId]}),/cannot be combined/);
 await assert.rejects(catalog.importPreset({preset:{type:'filament',name:'Multiple parents',inherits:[base.name]}}),/one inheritance name/);
});
test('imported native expressions control discovery and material print lists use original precedence',{timeout:30000},async t=>{
 const {catalog,ids,base}=await setup(t),native=await catalog.importPreset({preset:{type:'filament',name:'Native expression import',inherits:base.name,compatible_printers:[],compatible_printers_condition:'nozzle_diameter[0] == 0.4',compatible_prints:['Test Fine A'],compatible_prints_condition:'false'}});
 const all=await catalog.listResolved({printerId:ids.printerId}),fine=all.processes.find(item=>item.name==='Test Fine A'),standard=all.processes.find(item=>item.name==='Test Standard A');
 assert.ok((await catalog.listResolved({printerId:ids.printerId,processId:fine.id})).filaments.some(item=>item.id===native.id));assert.ok(!(await catalog.listResolved({printerId:ids.printerId,processId:standard.id})).filaments.some(item=>item.id===native.id));
 const inherited=await catalog.importPreset({preset:{type:'filament',name:'Inherited expression import',inherits:native.name}});assert.deepEqual(inherited.nativeCompatibility,native.nativeCompatibility);
 const cleared=await catalog.importPreset({preset:{type:'filament',name:'Explicit empty import',inherits:native.name,compatible_prints:[],compatible_prints_condition:''}});assert.deepEqual(cleared.nativeCompatibility.compatible_prints,[]);assert.equal(cleared.nativeCompatibility.compatible_printers_condition,'nozzle_diameter[0] == 0.4');
});
test('incompatible imported presets stay editable but ordinary native resolution always enforces compatibility',{timeout:30000},async t=>{
 const {catalog,service,ids,base}=await setup(t),imported=await catalog.importPreset({preset:{type:'filament',name:'Fixable false condition',inherits:base.name,compatible_printers:[],compatible_printers_condition:'false'}});
 const selection={...ids,filamentId:imported.id};const context=await catalog.sourceContext(imported.id,'filament',{selection});assert.ok(context.compatibilityResults.some(item=>item.name===imported.name&&!item.compatible));assert.equal(context.settings.nozzle_temperature[0],'200');
 for(const compatibilityPolicy of ['inspect','enforce'])await assert.rejects(service.resolveCatalogNativeSettings({catalog,selection,compatibilityPolicy}),/incompatible/);
 const saved=await catalog.saveCustom({settings:{nozzle_temperature:[217]},nativeCompatibility:imported.nativeCompatibility,nativeEditor:true,selection},imported.id);assert.equal(saved.settings.nozzle_temperature[0],'217');assert.equal(saved.nativeCompatibility.compatible_printers_condition,'false');
 await assert.rejects(service.resolveCatalogNativeSettings({catalog,selection}),/incompatible/);
 const edited=await catalog.saveCustom({settings:{nozzle_temperature:[217]},nativeCompatibility:{...saved.nativeCompatibility,compatible_printers_condition:'true'},nativeEditor:true,selection},imported.id);assert.equal(edited.nativeCompatibility.compatible_printers_condition,'true');assert.equal((await service.resolveCatalogNativeSettings({catalog,selection})).filaments[0].nozzle_temperature[0],'217');
});
test('native first system filament save seeds the base printer once, but process and derived custom saves retain All',{timeout:30000},async t=>{
 const {catalog,ids}=await setup(t),dependencies={compatible_printers:[],compatible_printers_condition:'true',compatible_prints:[],compatible_prints_condition:''};
 const first=await catalog.saveCustom({type:'filament',name:'First system derivative',baseId:ids.filamentId,settings:{},nativeCompatibility:dependencies,nativeEditor:true,selection:ids});assert.deepEqual(first.nativeCompatibility.compatible_printers,['Test Printer A']);
 const all=await catalog.saveCustom({nativeCompatibility:dependencies,nativeEditor:true,selection:ids},first.id);assert.deepEqual(all.nativeCompatibility.compatible_printers,[]);
 const copy=await catalog.saveCustom({type:'filament',name:'Derivative of custom',baseId:all.id,settings:{},nativeCompatibility:dependencies,nativeEditor:true,selection:ids});assert.deepEqual(copy.nativeCompatibility.compatible_printers,[]);
 const process=await catalog.saveCustom({type:'process',name:'System process derivative',baseId:ids.processId,settings:{},nativeCompatibility:{compatible_printers:[],compatible_printers_condition:'false'},nativeEditor:true,selection:ids});assert.deepEqual(process.nativeCompatibility.compatible_printers,[]);assert.equal(process.nativeCompatibility.compatible_printers_condition,'false');
});

test('native full-config condition groups remain bounded and survive project settings plus archive roundtrip',{timeout:30000},async t=>{
 const {catalog,service,ids,base}=await setup(t),record=await catalog.importPreset({preset:{type:'filament',name:'Archived condition vectors',inherits:base.name,compatible_printers:[],compatible_printers_condition:'true',compatible_prints:[],compatible_prints_condition:'layer_height > 0'}});
 const result=await service.resolveCatalogNativeSettings({catalog,selection:{...ids,filamentId:record.id}}),normalized=normalizeProjectSettings(result.archiveSettings).settings;
 assert.deepEqual(normalized.compatible_machine_expression_group,['','true']);assert.deepEqual(normalized.compatible_process_expression_group,['layer_height > 0']);
 const archive=exportNative3MF({...importNative3MF(await readFile('tests/fixtures/orca-2.4.2-cube.3mf')),nativeSettings:normalized});const imported=importNative3MF(archive);assert.deepEqual(imported.nativeSettings.compatible_machine_expression_group,['','true']);assert.deepEqual(imported.nativeSettings.compatible_process_expression_group,['layer_height > 0']);
 for(const bad of ['false',Array(67).fill(''),['a'.repeat(16385)],['bad\0value'],[42]])assert.throws(()=>normalizeProjectSettings({...normalized,compatible_machine_expression_group:bad}),/expression group/);
});

test('native compatibility ancestry retains a derived custom parent when Save as new copies it',{timeout:30000},async t=>{
 const {catalog,ids}=await setup(t),system=catalog.getPreset(ids.printerId,'machine');
 const root=await catalog.importPreset({preset:{...system,name:'Native root printer',inherits:''}}),child=await catalog.saveCustom({type:'machine',name:'Native child printer',baseId:root.id,settings:{}}),copy=await catalog.saveCustom({type:'machine',name:'Native sibling copy',baseId:child.id,settings:{}});
 assert.equal(catalog.compatibilityMetadata(child.id,'machine').parent,root.name);assert.equal(catalog.compatibilityMetadata(copy.id,'machine').parent,root.name);
 const process=catalog.getPreset(ids.processId,'process'),forRoot=await catalog.importPreset({preset:{type:'process',inherits:process.name,name:'Targets root ancestry',compatible_printers:[root.name]}}),forChild=await catalog.importPreset({preset:{type:'process',inherits:process.name,name:'Targets immediate child',compatible_printers:[child.name]}});
 const choices=await catalog.listResolved({printerId:copy.id});assert.ok(choices.processes.some(value=>value.id===forRoot.id));assert.ok(!choices.processes.some(value=>value.id===forChild.id));
 const edited=await catalog.sourceContext(forChild.id,'process',{selection:{printerId:copy.id}});assert.ok(edited.settings.layer_height);assert.ok(edited.compatibilityResults.some(value=>value.name===forChild.name&&!value.compatible));
});
