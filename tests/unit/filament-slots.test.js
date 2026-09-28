import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject } from '../../shared/project.js';
import { addFilamentSlot, removeFilamentSlot, setFilamentColor, filamentSlotCount } from '../../shared/filament-slots.js';
test('adding slots preserves existing purge values and initializes the native 140+140 transition defaults', () => {
  let project = { ...emptyProject(), ids: { printerId:'p',processId:'s',filamentId:'red' } };
  project=addFilamentSlot(project); assert.deepEqual(project.filamentIds,['red','red']); assert.deepEqual(project.projectOverrides.flush_volumes_matrix,['0','280','280','0']);
  project.projectOverrides.flush_volumes_matrix[1]='375'; project=addFilamentSlot(project);
  assert.deepEqual(project.projectOverrides.flush_volumes_matrix,['0','375','280','280','0','280','280','280','0']);
  project=setFilamentColor(project,2,'#123ABC'); assert.equal(project.projectOverrides.filament_colour[2],'#123ABC');
});
test('removing a used slot fails; unused removal remaps parts and layer events without changing the original', () => {
  const project={...emptyProject(),filamentIds:['red','green','blue'],ids:{printerId:'p',processId:'s',filamentId:'red'},objects:[{filamentSlot:3,native:{objectSettings:{extruder:'3'},partSettings:{extruder:'0'}}}],plates:[{id:'plate-1',layerEvents:{mode:'MultiAsSingle',items:[{type:'ToolChange',extruder:3}]}}]};
  assert.throws(()=>removeFilamentSlot(project,2),/Reassign/);
  const changed=removeFilamentSlot(project,1); assert.deepEqual(changed.filamentIds,['red','blue']); assert.equal(changed.objects[0].filamentSlot,2); assert.equal(changed.objects[0].native.objectSettings.extruder,'2'); assert.equal(changed.plates[0].layerEvents.items[0].extruder,2); assert.equal(project.objects[0].filamentSlot,3);
});
test('embedded slot duplication preserves per-material vector values and round-trips an unused slot removal', () => {
  const original={...emptyProject(),useEmbeddedSettings:true,nativeSettings:{filament_settings_id:['PLA'],filament_diameter:['1.75'],nozzle_temperature:['212'],filament_colour:['#ABCDEF'],filament_map:['1']}};
  const added=addFilamentSlot(original); assert.equal(filamentSlotCount(added),2); assert.deepEqual(added.nativeSettings.nozzle_temperature,['212','212']); assert.deepEqual(added.nativeSettings.filament_map,['1','1']);
  const removed=removeFilamentSlot(added,1); assert.deepEqual(removed.nativeSettings.filament_settings_id,['PLA']); assert.deepEqual(removed.nativeSettings.nozzle_temperature,['212']); assert.throws(()=>removeFilamentSlot(removed,0),/at least one/);
});
