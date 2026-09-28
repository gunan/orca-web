import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8, strFromU8 } from 'fflate';
import { importNative3MF, exportNative3MF, nativePlateOrigin, nativeSettingsFromSelection, normalizeNativeLayerEvents, validateNativeArchiveSafety } from '../../shared/native-project.js';
import { meshBounds, transformPositions } from '../../shared/geometry.js';
import { extractBoundedZip } from '../../shared/import-limits.js';
import { makeNativeAcceptanceProject } from '../fixtures/native-project.js';
const fixture = await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf', import.meta.url));
function edited(entries, fn) { const files=extractBoundedZip(entries);fn(files);return zipSync(files); }
function twoSlots(project) {
  return {...project,nativeSettings:{...project.nativeSettings,filament_settings_id:['Red PLA','Blue PLA'],filament_colour:['#FF0000','#0000FF'],flush_volumes_matrix:['0','280','280','0'],flush_volumes_vector:['140','140','140','140']}};
}

test('reads actual OrcaSlicer 2.4.2 project settings, production components, names and exact surfaces', () => {
  const p=importNative3MF(fixture,{filename:'Native cube.3mf'});
  assert.equal(p.name,'Native cube');assert.equal(p.objects.length,1);
  assert.deepEqual(meshBounds(p.objects[0]),{min:[0,0,0],max:[20,20,20],size:[20,20,20],center:[10,10,10]});
  assert.equal(p.nativeSettings.layer_height,'0.16');assert.equal(p.nativeSettings.outer_wall_speed,'70');
  assert.equal(p.nativePresetNames.printer,'Prusa MK4 0.4 nozzle');
  assert.equal(p.objects[0].native.objectId,2);assert.equal(p.objects[0].native.partId,1);assert.equal(p.objects[0].filamentSlot,1);
});

test('native archive roundtrip preserves plate-local geometry, part roles, per-object overrides and filament slots', () => {
  const p=twoSlots(makeNativeAcceptanceProject(importNative3MF(fixture)));
  const bytes=exportNative3MF(p);const q=importNative3MF(bytes);
  assert.deepEqual(q.plates.map(plate=>plate.name),p.plates.map(plate=>plate.name));
  assert.equal(q.plates[1].native.origin[0],300);
  for(const object of p.objects){const actual=q.objects.find(item=>item.name===object.name);assert.ok(actual);assert.deepEqual(actual.positions,Array.from(transformPositions(object)));assert.equal(actual.native.partType,object.native.partType);assert.equal(actual.filamentSlot,object.filamentSlot);assert.equal(actual.plateId,object.plateId);assert.deepEqual(actual.native.objectSettings,object.native.objectSettings);}
  assert.equal(q.objects.find(o=>o.name==='Dense corner').native.partSettings.sparse_infill_density,'50%');
  const raw=strFromU8(extractBoundedZip(bytes)['Metadata/model_settings.config']);
  assert.match(raw,/Cutout &amp; modifiers/);assert.match(raw,/Second &quot;blue&quot; plate/);
  const active=importNative3MF(exportNative3MF({...p,activePlateId:'plate-2'},{allPlates:false}));assert.equal(active.plates.length,1);assert.equal(active.objects.length,1);assert.deepEqual(meshBounds(active.objects[0]).min,[70,80,0]);
});

test('native plate grid and filament merging preserve independent arrays and reject ambiguous profile vectors', () => {
  assert.deepEqual(nativePlateOrigin(3,4,{width:250,depth:210}),[300,-252,0]);
  const printer={name:'P',nozzle_diameter:['.4'],printable_area:['0x0','250x0','250x210']},process={name:'Quality',layer_height:'.16'},filament={name:'Red',filament_type:['PLA'],filament_colour:['#FF0000'],temperature:['205']};
  const settings=nativeSettingsFromSelection({printer,process,filaments:[filament,{...filament,name:'Blue',temperature:['215']}]});
  assert.deepEqual(settings.temperature,['205','215']);assert.deepEqual(settings.nozzle_diameter,['.4']);assert.deepEqual(settings.flush_volumes_matrix,['0','280','280','0']);assert.deepEqual(settings.filament_settings_id,['Red','Blue']);
  assert.deepEqual(settings.filament_colour,['#FF0000','#FF0000']);
  const missingColor={...filament};delete missingColor.filament_colour;
  assert.deepEqual(nativeSettingsFromSelection({printer,process,filaments:[missingColor,missingColor]}).filament_colour,['#F2754E','#F2754E']);
  assert.throws(()=>nativeSettingsFromSelection({printer,process,filament:{...filament,temperature:['205','215']}}),/one value per slot/);
  assert.throws(()=>nativePlateOrigin(1,2,null),/printable_area/);
});

test('native parser rejects unsafe XML, component cycles, missing meshes, duplicate IDs and excessive instancing', () => {
  assert.throws(()=>importNative3MF(edited(fixture,f=>{f['3D/3dmodel.model']=strToU8('<!DOCTYPE model [<!ENTITY x "boom">]><model/>');})),/entities/);
  assert.throws(()=>importNative3MF(edited(fixture,f=>{f['3D/3dmodel.model']=strToU8('<model unit="millimeter"><resources><object id="1"><components><component objectid="1"/></components></object></resources><build><item objectid="1"/></build></model>');})),/Cyclic/);
  assert.throws(()=>importNative3MF(edited(fixture,f=>{f['3D/3dmodel.model']=strToU8('<model><resources/><build><item objectid="99"/></build></model>');})),/Missing/);
  assert.throws(()=>importNative3MF(edited(fixture,f=>{f['3D/3dmodel.model']=strToU8('<model><resources><object id="1"/><object id="1"/></resources><build/></model>');})),/Duplicate/);
  assert.throws(()=>importNative3MF(fixture,{limits:{maxTriangles:11}}),/triangle/i);
  assert.throws(()=>importNative3MF(edited(fixture,f=>{f['3D/3dmodel.model']=strToU8(strFromU8(f['3D/3dmodel.model']).replace('</build>','<item objectid="2"/></build>'));}),{limits:{maxTriangles:12}}),/triangle/i);
  assert.throws(()=>importNative3MF(edited(fixture,f=>{f['3D/3dmodel.model']=strToU8(strFromU8(f['3D/3dmodel.model']).replace('/3D/Objects/model.stl_1.model','../escape.model'));})),/Unsafe/);
});

test('nonprinting build instances remain visible project geometry with their native printable flag', () => {
  const p=importNative3MF(edited(fixture,f=>{f['3D/3dmodel.model']=strToU8(strFromU8(f['3D/3dmodel.model']).replace('printable="1"','printable="0"'));}));
  assert.equal(p.objects[0].visible,true);assert.equal(p.objects[0].printable,false);
  const q=importNative3MF(exportNative3MF(p));assert.equal(q.objects[0].printable,false);
});

test('connection credentials are omitted and invalid assignments fail before export', () => {
  const p=importNative3MF(edited(fixture,f=>{const value=JSON.parse(strFromU8(f['Metadata/project_settings.config']));value.printhost_apikey='private-secret';f['Metadata/project_settings.config']=strToU8(JSON.stringify(value));}));
  assert.equal(p.nativeSettings.printhost_apikey,undefined);assert.ok(p.nativeImportWarnings.some(w=>w.includes('omitted')));
  p.objects[0].filamentSlot=2;assert.throws(()=>exportNative3MF(p),/slot 2 is missing/);
  p.objects[0].filamentSlot=1;p.objects[0].native.partType='unknown';assert.throws(()=>exportNative3MF(p),/Unsupported native part type/);
});

test('native layer events preserve pauses, color/tool changes and multiline custom text per plate', () => {
  const p=twoSlots(makeNativeAcceptanceProject(importNative3MF(fixture)));
  p.plates[0].layerEvents={mode:'SingleExtruder',items:[
    {printZ:1,type:'PausePrint',extruder:1,color:'',extra:'Insert nut & resume'},
    {printZ:2,type:'ColorChange',extruder:1,color:'#FFAA00',extra:''},
    {printZ:3,type:'ToolChange',extruder:2,color:'#0000FF',extra:''},
    {printZ:4,type:'Custom',extruder:0,color:'',extra:'M117 Native event\n; Literal $(example) & <tag> "quote"'}
  ]};
  p.plates[1].layerEvents={mode:'SingleExtruder',items:[{printZ:5,type:'Template',extruder:1,color:'',extra:''}]};
  const q=importNative3MF(exportNative3MF(p));
  assert.deepEqual(q.plates.map(plate=>({mode:plate.layerEvents.mode,items:plate.layerEvents.items.map(({gcode,...event})=>event)})),p.plates.map(plate=>plate.layerEvents));
  const one=importNative3MF(exportNative3MF({...p,activePlateId:'plate-2'},{allPlates:false}));assert.equal(one.plates[0].layerEvents.items[0].printZ,5);
  assert.throws(()=>normalizeNativeLayerEvents({mode:'SingleExtruder',items:[{printZ:NaN,type:'Custom',extruder:0}]}),/height/);
  assert.throws(()=>normalizeNativeLayerEvents({mode:'SingleExtruder',items:[{printZ:1,type:'ToolChange',extruder:0}]}),/extruder/);
  const legacy=importNative3MF(edited(fixture,f=>{f['Metadata/custom_gcode_per_layer.xml']=strToU8('<custom_gcodes_per_layer><layer top_z="2" extruder="1" color="Insert nut" gcode="M601"/><mode value="SingleExtruder"/></custom_gcodes_per_layer>');}));
  assert.equal(legacy.plates[0].layerEvents.items[0].type,'PausePrint');assert.equal(legacy.plates[0].layerEvents.items[0].extra,'Insert nut');
});

test('server archive safety rejects embedded post-process commands in every native settings carrier', () => {
  assert.ok(validateNativeArchiveSafety(fixture).checkedFiles>=4);
  for(const filename of ['Metadata/project_settings.config','Metadata/process_settings_1.config','Metadata/orca-web.json']){
    assert.throws(()=>validateNativeArchiveSafety(edited(fixture,f=>{f[filename]=strToU8(JSON.stringify({nested:{post_process:['/tmp/never-execute.sh']}}));})),/post_process commands are prohibited/);
  }
  for(const key of ['post_process','post&#95;process']){
    assert.throws(()=>validateNativeArchiveSafety(edited(fixture,f=>{f['Metadata/model_settings.config']=strToU8(`<config><object id="2"><part id="1"><metadata key="${key}" value="/tmp/never-execute.sh"/></part></object></config>`);})),/post_process commands are prohibited/);
  }
  assert.throws(()=>validateNativeArchiveSafety(edited(fixture,f=>{f['Metadata/Slic3r_PE.config']=strToU8('; layer_height = 0.2\n; post_process = /tmp/never-execute.sh\n');})),/post_process commands are prohibited/);
  const harmless=edited(fixture,f=>{f['Metadata/orca-web.json']=strToU8(JSON.stringify({post_process:['',''],machine_pause_gcode:'M601',note:'post_process is a label'}));f['Metadata/custom_gcode_per_layer.xml']=strToU8('<custom_gcodes_per_layer><layer extra="M117 Literal $(example)"/></custom_gcodes_per_layer>');});
  assert.ok(validateNativeArchiveSafety(harmless).checkedFiles>=4);
  assert.throws(()=>validateNativeArchiveSafety(edited(fixture,f=>{f['Metadata/model_settings.config']=strToU8('<!DOCTYPE config [<!ENTITY hidden "command">]><config/>');})),/entities/);
  assert.throws(()=>validateNativeArchiveSafety(edited(fixture,f=>{f['Metadata/orca-web.json']=strToU8('{broken');})),/Invalid 3MF JSON/);
});
