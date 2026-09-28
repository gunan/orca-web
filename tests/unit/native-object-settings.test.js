import test from 'node:test';
import assert from 'node:assert/strict';
import { displayedObjectSettings, normalizeObjectSettings, normalizeNativeParts, supportedObjectSettings, supportedPartSettings, updateNativePart } from '../../shared/native-object-settings.js';

const parts=()=>[
  {id:'a',name:'Body',plateId:'one',filamentSlot:1,native:{groupId:'assembly',objectName:'Assembly',partType:'normal_part',objectSettings:{wall_loops:'3'},partSettings:{}}},
  {id:'b',name:'Hole',plateId:'one',filamentSlot:1,native:{groupId:'assembly',objectName:'Assembly',partType:'negative_part',objectSettings:{wall_loops:'3'},partSettings:{}}},
  {id:'c',name:'Other',plateId:'one',filamentSlot:2,native:{groupId:'other',objectName:'Other object',partType:'normal_part',objectSettings:{wall_loops:'2'},partSettings:{outer_wall_speed:'40'}}},
  {id:'d',name:'Another plate',plateId:'two',filamentSlot:1,native:{groupId:'assembly',partType:'normal_part',objectSettings:{wall_loops:'1'},partSettings:{}}}
];

test('source object and region memberships reject global options and decode native percent/vector values',()=>{
  assert.equal(supportedObjectSettings.has('layer_height'),true);assert.equal(supportedPartSettings.has('layer_height'),false);
  assert.equal(supportedObjectSettings.has('travel_speed'),false);
  assert.deepEqual(normalizeObjectSettings({sparse_infill_density:50,wall_loops:4},2,{part:true}),{sparse_infill_density:'50%',wall_loops:'4'});
  assert.throws(()=>normalizeObjectSettings({layer_height:.16},1,{part:true}),/Unsupported part/);
  assert.throws(()=>normalizeObjectSettings({post_process:['echo malicious']},1),/Unsupported object/);
  assert.throws(()=>normalizeObjectSettings({wall_loops:-1}),/integer/);
  assert.deepEqual(displayedObjectSettings({sparse_infill_density:'50%',wall_loops:'4'}),{wall_loops:'4',sparse_infill_density:'50'});
  assert.throws(()=>normalizeObjectSettings({extruder:'3'},2),/extruder/);
});

test('object edits propagate within one native group and part edits remain independent',()=>{
  const source=parts(),before=structuredClone(source);
  const objectEdit=updateNativePart(source,'a',{objectSettings:{wall_loops:'5'},objectName:'Updated'});
  assert.deepEqual(objectEdit.slice(0,2).map(object=>object.native.objectSettings),[{wall_loops:'5'},{wall_loops:'5'}]);
  assert.equal(objectEdit[2].native.objectSettings.wall_loops,'2');assert.equal(objectEdit[3].native.objectSettings.wall_loops,'1');
  const partEdit=updateNativePart(objectEdit,'b',{partSettings:{sparse_infill_density:'70%'},filamentSlot:2});
  assert.deepEqual(partEdit[0].native.partSettings,{});assert.equal(partEdit[1].native.partSettings.sparse_infill_density,'70%');assert.equal(partEdit[1].filamentSlot,2);
  assert.deepEqual(source,before,'editing must not mutate the original project or shared native metadata');
  assert.equal(normalizeNativeParts(partEdit,2)[1].native.objectName,'Updated');
});

test('joining a group adopts its settings; changing role requires a visible normal part',()=>{
  const moved=updateNativePart(parts(),'b',{groupId:'other'});
  assert.equal(moved[1].native.objectSettings.wall_loops,'2');assert.equal(moved[1].native.objectName,'Other object');
  assert.equal(normalizeNativeParts(moved,2)[1].native.groupId,'other');
  assert.throws(()=>normalizeNativeParts(updateNativePart(parts(),'b',{groupId:'new'}),2),/needs a normal part/);
  assert.throws(()=>normalizeNativeParts(updateNativePart(parts(),'a',{partType:'support_blocker'}),2),/needs a normal part/);
  assert.throws(()=>normalizeNativeParts(updateNativePart(parts(),'a',{filamentSlot:3}),2),/filament slot/);
  const inconsistent=parts();inconsistent[1].native.objectSettings.wall_loops='7';
  assert.throws(()=>normalizeNativeParts(inconsistent,2),/must share object settings/);
  const hidden=parts();hidden[0].visible=false;assert.throws(()=>normalizeNativeParts(hidden,2),/needs a normal part/);
});
