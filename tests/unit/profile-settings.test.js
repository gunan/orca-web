import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNativeProjectValues, projectSettingDefinitions, nativeProfileSchema, definitionsByScope, editableDefinitionsByScope, groupsByScope, normalizeProfileOverrides, normalizeNativeProfileValues, displayedProfileSettings, applyProfileOverrides } from '../../shared/profile-settings.js';

test('pinned source covers every machine and filament membership and exposes native groups', () => {
  assert.equal(nativeProfileSchema.provenance.commit, '8500fcdccaa10b5099ac20d252af3a7c560046f1');
  for (const [scope, count] of [['machine',160], ['filament',126]]) {
    assert.equal(definitionsByScope[scope].length, count);
    assert.equal(new Set(definitionsByScope[scope].map(option => option.key)).size, count);
    assert.deepEqual(nativeProfileSchema[scope].coverage.unresolved, []);
  }
  assert.equal(groupsByScope.machine['Motion ability'].find(option => option.key === 'machine_max_speed_x').ui.group, 'Speed limitation');
  assert.equal(groupsByScope.filament['Setting Overrides'].find(option => option.key === 'filament_retraction_length').derivedFrom, 'retraction_length');
  assert.equal(groupsByScope.filament['Setting Overrides'].find(option => option.key === 'filament_ironing_flow').ui.group, 'Ironing');
  assert.ok(definitionsByScope.filament.find(option => option.key === 'filament_type').options.includes('PEEK'));
  assert.equal(editableDefinitionsByScope.machine.length,115); assert.equal(editableDefinitionsByScope.filament.length,112);
});

test('all editor native defaults round-trip with native scalar/vector shapes', () => {
  for (const scope of ['machine','filament']) {
    const settings = displayedProfileSettings(scope, {});
    const normalized = normalizeProfileOverrides(scope, settings);
    assert.equal(Object.keys(normalized).length, editableDefinitionsByScope[scope].length);
    for (const option of editableDefinitionsByScope[scope]) assert.equal(Array.isArray(normalized[option.key]), ['vector','points','pointGroups'].includes(option.type), option.key);
  }
  assert.deepEqual(normalizeProfileOverrides('filament', { nozzle_temperature: [205,210], enable_pressure_advance: [true,false], filament_retract_before_wipe: ['50%',null], filament_ironing_flow: ['nil',20], filament_z_hop_types: ['Normal Lift',null] }), { nozzle_temperature:['205','210'], enable_pressure_advance:['1','0'], filament_retract_before_wipe:['50%','nil'], filament_ironing_flow:['nil','20%'], filament_z_hop_types:['Normal Lift','nil'] });
});

test('point and polygon normalization follows Config.hpp native JSON serialization', () => {
  assert.deepEqual(normalizeProfileOverrides('machine', { bed_mesh_min:[10,20], printable_area:[[0,0],'220x0',[220,220],'0,220'], extruder_printable_area:[[[0,0],[200,0],[200,200]],''] }), { bed_mesh_min:'10,20', printable_area:['0x0','220x0','220x220','0x220'], extruder_printable_area:['0x0,200x0,200x200',''] });
  for (const value of [[0], '1x2x3', [0,Infinity]]) assert.throws(() => normalizeProfileOverrides('machine',{bed_mesh_min:value}));
});

test('validators reject wrong scopes, overflow, malformed vectors, unknown enums, and unsafe imports', () => {
  for (const settings of [{ nozzle_temperature:205 }, { nozzle_temperature:[205.5] }, { nozzle_temperature:[true] }, { nozzle_temperature:[null] }, { nozzle_temperature:[1e100] }, { enable_pressure_advance:[1] }, { filament_z_hop_types:['unknown'] }, { filament_flow_ratio:[[1]] }, { inherits:'x' }, { compatible_printers:['any'] }, { layer_height:.2 }]) assert.throws(() => normalizeProfileOverrides('filament',settings));
  assert.throws(() => normalizeNativeProfileValues('machine',{enable_long_retraction_when_cut:2147483648}));
  assert.throws(() => normalizeNativeProfileValues('machine',{print_host:'http://printer'}),/Device connection/);
  assert.throws(() => normalizeNativeProfileValues('machine',{bed_custom_model:'/private/data/model.stl'}),/External asset/);
  assert.throws(() => normalizeNativeProfileValues('process',{post_process:['touch /tmp/never']}),/disabled/);
  assert.throws(() => normalizeProfileOverrides('machine',{machine_start_gcode:'x'.repeat(65537)}),/64 KB/);
  assert.throws(() => normalizeProfileOverrides('unknown',{}),/Unknown preset scope/);
});

test('ordinary machine and filament G-code strings survive exactly; native vectors replace instead of nesting', () => {
  const code = 'G28\nM109 S[first_layer_temperature]\n; user G-code';
  assert.equal(normalizeProfileOverrides('machine',{machine_start_gcode:code}).machine_start_gcode,code);
  const original={filament_start_gcode:['old'],nozzle_temperature:['200','200']};
  const applied=applyProfileOverrides('filament',original,{filament_start_gcode:[code],nozzle_temperature:[210,215]});
  assert.deepEqual(applied,{filament_start_gcode:[code],nozzle_temperature:['210','215']});
  assert.deepEqual(original.nozzle_temperature,['200','200']);
});

test('native project closed enums include serialized bed, mapping, and nozzle choices', () => {
  assert.deepEqual(normalizeNativeProjectValues({curr_bed_type:'Cool Plate',filament_map_mode:'Auto For Flush',nozzle_volume_type:['Standard']}),{curr_bed_type:'Cool Plate',filament_map_mode:'Auto For Flush',nozzle_volume_type:['Standard']});
  for(const option of [...projectSettingDefinitions,...definitionsByScope.machine,...definitionsByScope.filament].filter(option=>['coEnum','coEnums'].includes(option.nativeType)))assert.ok(option.options?.length,option.key);
  assert.throws(()=>normalizeNativeProjectValues({curr_bed_type:'Unknown bed'}));
});
