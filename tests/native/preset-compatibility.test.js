import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runNativeConfig,resolveCatalogNativeSettings} from '../../server/native-config.js';
import {createPresetCatalog} from '../../server/presets.js';
import {listNativeCompatiblePresets} from '../../server/native-compatibility.js';
import {compatibilityCases,compatibilityRequest,libraryRequest} from '../fixtures/native-compatibility-cases.js';
let installed;const systemCatalog=()=>installed??=createPresetCatalog();

test('pinned native compatibility predicates match independently linked original predicates', {timeout:120000},async()=>{
 const reference=JSON.parse(await readFile(new URL('../fixtures/native-compatibility-reference.json',import.meta.url),'utf8'));
 assert.equal(reference.sourceRevision,'8500fcdccaa10b5099ac20d252af3a7c560046f1');
 for(const item of compatibilityCases){const result=await runNativeConfig(compatibilityRequest(item));assert.equal(result.compatibility[0].compatible,item.expected,item.id);assert.equal(result.compatibility[0].compatible,reference.results[item.id],item.id);assert.equal(result.compatibility[0].diagnostics.length>0,Boolean(item.diagnostic),item.id);}
 assert.deepEqual((await runNativeConfig(libraryRequest)).exclusions,reference.exclusions);
});
test('native compatibility rejects malformed and oversized metadata without generic macro execution',async()=>{
 const request=compatibilityRequest(compatibilityCases[0]);
 for(const value of ['bad',Array(10001).fill('x')])await assert.rejects(runNativeConfig({...request,candidates:[{...request.candidates[0],compatible_printers:value}]}),/compatibility/);
 await assert.rejects(runNativeConfig({...request,candidates:[{...request.candidates[0],compatible_printers_condition:'x'.repeat(16385)}]}),/compatibility/);
 await assert.rejects(runNativeConfig({...request,candidates:Array(513).fill(request.candidates[0])}),/batch/);
 await assert.rejects(runNativeConfig({...request,candidates:[request.candidates[0],request.candidates[0]]}),/Duplicate/);
});
test('installed Prusa expression profiles are offered and admission rechecks changed hardware', {timeout:120000},async()=>{
 const catalog=await systemCatalog(),printer=catalog.list().printers.find(value=>value.name==='Prusa CORE One L 0.4 nozzle');assert.ok(printer);
 const choices=await listNativeCompatiblePresets({catalog,run:runNativeConfig,printerId:printer.id});
 assert.ok(choices.processes.some(value=>value.name==='0.20mm SPEED @CORE One L 0.4'));assert.ok(choices.compatibility.native);assert.equal(choices.processes.length,7);
 const selection={...choices.defaults};const resolved=await resolveCatalogNativeSettings({catalog,selection});assert.equal(resolved.compatibility.every(value=>value.compatible),true);assert.equal(resolved.effectiveSettings.layer_height,'0.2');
 await assert.rejects(resolveCatalogNativeSettings({catalog,selection,overrides:{machine:{nozzle_diameter:['0.6']}}}),/Native preset is incompatible/);
 const original=catalog.getPresetSource(selection.processId,'process');assert.ok(original.chain.some(value=>value.compatible_printers_condition));
});
test('native alias derivation retains C++ whitespace and empty-prefix fallback semantics',async()=>{
 const base={type:'filament',isSystem:true,compatible_printers:[],compatible_prints:[]},library={...base,id:'lib',name:'Generic PLA',vendor:'OrcaFilamentLibrary',alias:''};
 const same={...base,id:'vendor',name:'Generic PLA @Printer',vendor:'Other',alias:'',compatible_printers:['Printer']};
 assert.deepEqual((await runNativeConfig({operation:'filament-library-exclusions',candidates:[library,same]})).exclusions,{lib:['Printer']});
 const nbsp={...same,name:'Generic PLA\u00a0@Printer'};
 assert.deepEqual((await runNativeConfig({operation:'filament-library-exclusions',candidates:[library,nbsp]})).exclusions,{});
 assert.deepEqual((await runNativeConfig({operation:'filament-library-exclusions',candidates:[{...library,name:'@Empty'},{...same,name:'Other',alias:'@Empty'}]})).exclusions,{lib:['Printer']});
});
test('compatibility-only metadata cannot change archived/effective native configuration', {timeout:30000},async()=>{
 const catalog=await systemCatalog(),ids=catalog.list().defaults;
 const source=(id,type)=>{const result=catalog.getPresetSource(id,type);delete result.metadata;return result;};
 const request={printer:source(ids.printerId,'machine'),process:source(ids.processId,'process'),filaments:[source(ids.filamentId,'filament')],project:{filament_map:['1'],filament_colour:['#F2754E']}};
 const baseline=await runNativeConfig(request),withMetadata=structuredClone(request);
 withMetadata.printer.metadata={vendor:'Fixture',isSystem:true,parent:'Compatibility-only parent'};
 withMetadata.process.metadata={vendor:'Fixture',compatible_printers:[request.printer.name],compatible_printers_condition:'false'};
 withMetadata.filaments[0].metadata={vendor:'Fixture',compatible_printers:[request.printer.name],compatible_prints:[request.process.name]};
 const checked=await runNativeConfig(withMetadata);assert.deepEqual(checked.archiveSettings,baseline.archiveSettings);assert.deepEqual(checked.effectiveSettings,baseline.effectiveSettings);assert.deepEqual(checked.scopes,baseline.scopes);assert.ok(checked.compatibility.every(value=>value.compatible));
});
import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{createCustomPresetCatalog}from'../../server/custom-presets.js';
test('native profile editor fallback selects expression-compatible defaults when no selection was supplied',{timeout:30000},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'orca-compat-editor-')),base=await systemCatalog(),catalog=await createCustomPresetCatalog({baseCatalog:base,dataDir:directory});t.after(async()=>{await catalog.close();await rm(directory,{recursive:true,force:true});});const printer=catalog.list().printers.find(value=>value.name==='Prusa CORE One L 0.4 nozzle');const context=await catalog.sourceContext(printer.id,'machine');assert.ok(context.editorContext.selection.processId);assert.equal(context.relatedSettings.process.name,'0.20mm SPEED @CORE One L 0.4');
});
