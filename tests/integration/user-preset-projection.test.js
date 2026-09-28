import test from 'node:test';import assert from 'node:assert/strict';import{runNativeConfig}from'../../server/native-config.js';
const parent={name:'Parent material',settings:{filament_extruder_variant:['Direct Drive Standard','Direct Drive High Flow'],filament_retraction_length:['0.8','1.2'],filament_flow_ratio:['0.97','1.01'],filament_type:['PLA'],compatible_printers:['P']}};
test('original Preset::save emits parent differences and nullable variant nil markers, then native child loading resolves them',{timeout:30000},async()=>{
 const saved=(await runNativeConfig({operation:'user-preset-projection',mode:'save',scope:'filament',name:'Child material',parent,settings:{...parent.settings,filament_retraction_length:['0.8','0.9'],filament_flow_ratio:['0.98','1.01']}})).userPreset;
 assert.equal(saved.document.inherits,parent.name);assert.equal(saved.document.name,'Child material');assert.equal(saved.document.from,'User');assert.deepEqual(saved.document.filament_retraction_length,['nil','0.9']);assert.deepEqual(saved.document.filament_extruder_variant,parent.settings.filament_extruder_variant);assert.equal(saved.document.compatible_printers,undefined);
 const loaded=(await runNativeConfig({operation:'user-preset-projection',mode:'load',scope:'filament',name:'Child material',parent,document:saved.document})).userPreset.settings;assert.deepEqual(loaded.filament_retraction_length,['0.8','0.9']);assert.deepEqual(loaded.filament_flow_ratio,['0.98','1.01']);
 const updated=(await runNativeConfig({operation:'user-preset-projection',mode:'load',scope:'filament',name:'Child material',parent:{...parent,settings:{...parent.settings,filament_retraction_length:['0.7','1.3']}},document:saved.document})).userPreset.settings;assert.deepEqual(updated.filament_retraction_length,['0.7','0.9']);
});
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const captured=JSON.parse(await readFile(new URL('../fixtures/native-user-preset-reference.json',import.meta.url)));
const inputs=JSON.parse(await readFile(new URL('../fixtures/native-user-preset-input.json',import.meta.url)));
test('user-diff projection matches captured independent complete native user-file loading',{timeout:30000},async()=>{
 for(const fixture of inputs){
  const reference=captured.cases.find(row=>row.id===fixture.id);assert.ok(reference,fixture.id);
  const request={operation:'user-preset-projection',scope:fixture.scope,name:reference.input.name,...(fixture.parent?{parent:fixture.parent}:{})};
  const saved=(await runNativeConfig({...request,mode:'save',settings:fixture.settings})).userPreset;
  assert.deepEqual(saved.document,reference.input.document,`${fixture.id}: original saved diff`);
  assert.deepEqual((await runNativeConfig(reference.input)).userPreset,reference.expected,fixture.id);
 }
});
test('independent user-file reference is pinned to retained inputs, generator and native worker sources',async()=>{
 const hash=async path=>createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex');
 assert.equal(captured.provenance.sourceManifest.commit,'8500fcdccaa10b5099ac20d252af3a7c560046f1');
 assert.equal(await hash('../fixtures/native-user-preset-input.json'),captured.provenance.inputSha256);
 assert.equal(await hash('../../scripts/generate-native-user-preset-reference.py'),captured.provenance.generatorSha256);
 for(const name of ['worker/user-preset.hpp','worker/main.cpp'])assert.equal(await hash('../../native/config-worker/'+name),captured.provenance.workerSources[name]);
 assert.notEqual(captured.provenance.productionBinarySha256,captured.provenance.referenceBinarySha256);
});
test('native root-edit reload remains distinct from native user-file restart loading',{timeout:30000},async()=>{
 const input={operation:'user-preset-projection',scope:'filament',name:'Reload child',parent},saved=(await runNativeConfig({...input,mode:'save',settings:{...parent.settings,filament_retraction_length:['0.8','0.9']}})).userPreset;
 const next={...input,parent:{...parent,settings:{...parent.settings,filament_retraction_length:['0.7','1.3']}},document:saved.document};const reloaded=(await runNativeConfig({...next,mode:'reload'})).userPreset.settings,loaded=(await runNativeConfig({...next,mode:'load'})).userPreset.settings;
 assert.deepEqual(reloaded.filament_retraction_length,['nil','0.9']);assert.deepEqual(loaded.filament_retraction_length,['0.7','0.9']);
});

import{projectNativeUserPreset}from'../../server/native-user-presets.js';
test('private server boundary retains original native diff, version, identity and full variants',{timeout:30000},async()=>{
 const nativeConfig={run:runNativeConfig},saved=await projectNativeUserPreset({type:'filament',mode:'save',name:'Server child',parent,settings:{...parent.settings,version:'2.3.0.0',filament_retraction_length:['0.8','0.9']}},{nativeConfig});
 assert.equal(saved.nativeDocument.type,'filament');assert.deepEqual(saved.nativeDocument.filament_retraction_length,['nil','0.9']);assert.equal(saved.nativeDocument.inherits,parent.name);assert.equal(saved.nativeDocument.version,'2.3.0.0');
 const loaded=await projectNativeUserPreset({type:'filament',mode:'load',name:'Server child',parent,document:saved.nativeDocument},{nativeConfig});assert.deepEqual(loaded.nativeFullSettings.filament_retraction_length,['0.8','0.9']);assert.equal(loaded.nativeFullSettings.version,'2.3.0.0');assert.deepEqual(loaded.nativeFullSettings.filament_extruder_variant,parent.settings.filament_extruder_variant);
});
