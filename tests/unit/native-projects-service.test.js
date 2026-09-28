import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeProjectService, normalizeObjectSettings, supportedObjectSettings, supportedPartSettings } from '../../server/native-projects.js';
import { importNative3MF } from '../../shared/native-project.js';
import { fixtureCatalog } from '../fixtures/native-project-catalog.js';
import { meshBounds } from '../../shared/geometry.js';
import { makeNativeAcceptanceProject } from '../fixtures/native-project.js';
const fixture=await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url));
const base=importNative3MF(fixture);

const service=createNativeProjectService({catalog:fixtureCatalog(base)});
const selection={printerId:'printer',processId:'process',filamentIds:['red']};

test('native service matches installed preset names without silently substituting missing names', async()=>{
  const result=await service.importArchive(fixture);assert.deepEqual(result.selection,selection);assert.equal(result.matches.printer.status,'matched');assert.equal(result.project.nativeSettings.host_type,undefined);
  const custom=structuredClone(base);custom.nativeSettings.printer_settings_id='Missing printer';
  const {exportNative3MF}=await import('../../shared/native-project.js');const missing=await service.importArchive(exportNative3MF(custom));assert.equal(missing.selection.printerId,'');assert.equal(missing.matches.printer.status,'missing');assert.equal(missing.fallbackSelection.printerId,'printer');assert.ok(missing.warnings.some(w=>w.includes('explicitly select replacements')));
});

test('native service validates embedded settings and catalog overrides as separate explicit modes', async()=>{
  const imported=await service.importArchive(fixture);
  const embedded=await service.prepare({project:imported.project,useEmbeddedSettings:true});assert.equal(embedded.summary.source,'embedded');assert.equal(embedded.settings.layer_height,'0.16');assert.equal(embedded.settings.outer_wall_speed,'70');
  const chosen=await service.prepare({project:imported.project,selection,overrides:{process:{layer_height:.24}}});assert.equal(chosen.settings.layer_height,'0.24');assert.equal(chosen.summary.printer,base.nativePresetNames.printer);assert.equal(chosen.summary.profile,base.nativePresetNames.process);
  await assert.rejects(service.prepare({project:imported.project,useEmbeddedSettings:true,overrides:{process:{layer_height:.24}}}),/cannot be mixed/);
  await assert.rejects(service.prepare({project:imported.project,selection:{...selection,printerId:'bad'}}),/Unknown preset/);
});

test('single-plate preparation preserves local placement, slot order and plate-specific events/tower values', async()=>{
  const p=makeNativeAcceptanceProject(base);
  p.nativeSettings={...p.nativeSettings,filament_settings_id:['Red PLA','Blue PLA'],filament_colour:['#FF0000','#0000FF']};
  const request={project:p,selection:{...selection,filamentIds:['red','blue']},plateId:'plate-2',overrides:{project:{wipe_tower_x:['10','90'],wipe_tower_y:['20','80']}}};
  p.plates[1].layerEvents={mode:'SingleExtruder',items:[{printZ:2.12,type:'Custom',extruder:0,color:'',extra:'M117 Retained'}]};
  // An unfinished object on another plate must not block slicing this plate.
  p.objects[0].position=[1000,1000,0];
  const result=await service.prepare(request);assert.equal(result.summary.plateCount,1);assert.equal(result.summary.plateId,'plate-2');assert.equal(result.summary.partCount,1);assert.deepEqual(result.settings.wipe_tower_x,['90']);
  const loaded=importNative3MF(result.bytes);assert.deepEqual(meshBounds(loaded.objects[0]).min,[70,80,0]);assert.equal(loaded.objects[0].filamentSlot,2);assert.equal(loaded.plates[0].layerEvents.items[0].extra,'M117 Retained');
});

test('object/part setting membership follows native static config classes and rejects global-only controls',()=>{
  assert.ok(supportedObjectSettings.has('layer_height'));assert.ok(!supportedPartSettings.has('layer_height'));assert.ok(supportedPartSettings.has('wall_loops'));
  assert.deepEqual(normalizeObjectSettings({wall_loops:'4',outer_wall_speed:'45',extruder:'2'},2,{part:true}),{extruder:'2',outer_wall_speed:'45',wall_loops:'4'});
  assert.throws(()=>normalizeObjectSettings({layer_height:'.16'},1,{part:true}),/Unsupported part/);
  assert.throws(()=>normalizeObjectSettings({travel_speed:'200'},1),/Unsupported object/);
  assert.throws(()=>normalizeObjectSettings({post_process:'"\/tmp\/never-execute.sh"'},1),/Unsupported object/);
  assert.throws(()=>normalizeObjectSettings({wall_loops:'2.5'},1),/integer/);
  assert.throws(()=>normalizeObjectSettings({extruder:'2'},1),/extruder/);
});

test('native service rejects host hooks, unknown settings, mismatched slots, invalid events and build-volume errors',async()=>{
  const imported=(await service.importArchive(fixture)).project;
  for(const [edit,pattern]of [
    [p=>{p.nativeSettings.post_process=['/tmp/never-execute.sh'];},/Post-processing/],
    [p=>{p.nativeSettings.unrecognized_switch='1';},/Unsupported embedded/],
    [p=>{p.objects[0].filamentSlot=2;},/filament slot/],
    [p=>{p.objects[0].position=[1000,0,0];},/outside/],
    [p=>{p.objects[0].native.partType='modifier_part';},/normal part/],
    [p=>{p.plates[0].layerEvents={mode:'SingleExtruder',items:[{printZ:999,type:'PausePrint',extruder:1,color:'',extra:''}]};},/exceeds/]
  ]){const p=structuredClone(imported);edit(p);await assert.rejects(service.prepare({project:p,useEmbeddedSettings:true}),pattern);}
});

test('native filament colors are complete when imported metadata omits them, and unsafe nozzle mappings are rejected',async()=>{
 const project=structuredClone(base);
 delete project.nativeSettings.filament_colour;
 const prepared=await service.prepare({project,useEmbeddedSettings:true});
 assert.deepEqual(prepared.settings.filament_colour,['#F2754E']);
 for(const value of [[],['0'],['2'],['1','1']]){
  const invalid=structuredClone(project);invalid.nativeSettings.filament_map=value;
  await assert.rejects(service.prepare({project:invalid,useEmbeddedSettings:true}),/Filament mapping/);
 }
});


test('fresh GUI project color metadata survives strict preparation while invalid vectors are rejected', async()=>{
 const bytes=await readFile(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url));
 const imported=await service.importArchive(bytes);
 const prepared=await service.prepare({project:imported.project,useEmbeddedSettings:true});
 assert.deepEqual(prepared.settings.filament_colour_type,['1']);
 assert.deepEqual(prepared.settings.filament_multi_colour,['#F2754E']);
 const roundtrip=importNative3MF(prepared.bytes);
 assert.deepEqual(roundtrip.nativeSettings.filament_colour_type,['1']);
 assert.deepEqual(roundtrip.nativeSettings.filament_multi_colour,['#F2754E']);
 for(const [key,value,pattern]of [['filament_colour_type','1',/array/],['filament_multi_colour',[1],/string/],['filament_multi_colour',['bad\0color'],/null/]]){
  const project=structuredClone(imported.project);project.nativeSettings[key]=value;
  await assert.rejects(service.prepare({project,useEmbeddedSettings:true}),pattern);
 }
});
