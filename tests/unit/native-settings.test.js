import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSchema, settingDefinitions, editableSettingDefinitions, settingGroups, normalizeOverrides, displayedSettings } from '../../shared/native-settings.js';

test('schema membership and native UI ordering are complete for the pinned 2.4.2 process source', () => {
  assert.equal(nativeSchema.provenance.commit, '8500fcdccaa10b5099ac20d252af3a7c560046f1');
  assert.equal(settingDefinitions.length, 355);
  assert.equal(new Set(settingDefinitions.map(definition => definition.key)).size, 355);
  assert.equal(editableSettingDefinitions.length, 342);
  assert.deepEqual(nativeSchema.coverage.unresolved, []);
  assert.deepEqual(Object.keys(settingGroups), ['Quality', 'Strength', 'Speed', 'Support', 'Multimaterial', 'Others']);
  assert.equal(settingGroups.Quality[0].key, 'layer_height');
  assert.equal(settingGroups.Quality[0].ui.group, 'Layer height');
  for (const definition of settingDefinitions) {
    assert.ok(definition.type, definition.key);
    assert.ok(definition.source.line > 0, definition.key);
    assert.equal(definition.source.file, 'PrintConfig.cpp');
    if (definition.ui) assert.ok(definition.label, definition.key);
    if (definition.nativeType === 'coEnum') assert.ok(definition.options.includes(definition.default), definition.key);
  }
  assert.match(nativeSchema.dependencyStatus, /not implemented/);
});

test('legacy process overrides retain their native representations and invalid-value rejection', () => {
  assert.deepEqual(normalizeOverrides({ layer_height: '0.12', enable_support: false, sparse_infill_density: '25', wall_generator: 'arachne', ironing_type: 'top' }), {
    layer_height: '0.12', enable_support: '0', sparse_infill_density: '25%', wall_generator: 'arachne', ironing_type: 'top'
  });
  for (const value of [null, [], { layer_height: '' }, { layer_height: Infinity }, { wall_loops: 1.5 }, { sparse_infill_density: 101 }, { enable_support: 'false' }, { seam_position: 'Aligned' }, { ironing: true }, { machine_start_gcode: 'ignored' }]) assert.throws(() => normalizeOverrides(value));
  const preset = { layer_height: '0.28', initial_layer_print_height: '0.28', enable_support: '0', sparse_infill_density: '30%', outer_wall_speed: ['75'], name: 'Draft' };
  assert.deepEqual(displayedSettings(preset), { layer_height: '0.28', initial_layer_print_height: '0.28', sparse_infill_density: '30', outer_wall_speed: '75', enable_support: false });
});

test('float-or-percent settings retain unit semantics and use authoritative native ranges', () => {
  assert.deepEqual(normalizeOverrides({ outer_wall_line_width: '125%', inner_wall_line_width: '0.45', infill_anchor: '17.5%', small_perimeter_speed: 25 }), {
    outer_wall_line_width: '125%', inner_wall_line_width: '0.45', infill_anchor: '17.5%', small_perimeter_speed: '25'
  });
  assert.equal(displayedSettings({ outer_wall_line_width: '125%' }).outer_wall_line_width, '125%');
  assert.throws(() => normalizeOverrides({ wall_loops: '125%' }));
  assert.throws(() => normalizeOverrides({ outer_wall_line_width: 'Infinity%' }));
  assert.throws(() => normalizeOverrides({ layer_height: '0x10' }));
  assert.throws(() => normalizeOverrides({ wall_transition_angle: 100 }));
  for (const key of ['layer_height', 'initial_layer_print_height', 'bridge_flow', 'internal_bridge_flow']) assert.throws(() => normalizeOverrides({ [key]: 0 }), /greater than 0/);
});

test('complete native enum values and readable labels come from source definitions', () => {
  const ironing = settingDefinitions.find(definition => definition.key === 'ironing_type');
  assert.deepEqual(ironing.options, ['no ironing', 'top', 'topmost', 'solid']);
  assert.equal(ironing.optionLabels.topmost, 'Topmost surface');
  assert.deepEqual(normalizeOverrides({ ironing_type: 'solid', brim_type: 'outer_and_inner' }), { ironing_type: 'solid', brim_type: 'outer_and_inner' });
  const bottom = settingDefinitions.find(definition => definition.key === 'bottom_surface_pattern');
  const top = settingDefinitions.find(definition => definition.key === 'top_surface_pattern');
  assert.deepEqual(bottom.options, top.options);
  assert.equal(bottom.default, 'monotonic');
  assert.equal(top.default, 'monotonicline');
});

test('native vector options remain vectors, strings are bounded, and profile plumbing is rejected', () => {
  const model = ['0,0', '\n0.2,0.4444'];
  assert.deepEqual(normalizeOverrides({ small_area_infill_flow_compensation_model: model }), { small_area_infill_flow_compensation_model: model });
  assert.deepEqual(displayedSettings({ small_area_infill_flow_compensation_model: model }), { small_area_infill_flow_compensation_model: model });
  assert.throws(() => normalizeOverrides({ small_area_infill_flow_compensation_model: '0,0' }));
  assert.throws(() => normalizeOverrides({ small_area_infill_flow_compensation_model: [['nested']] }));
  for (const key of ['inherits', 'compatible_printers', 'compatible_printers_condition', 'print_extruder_id', 'machine_start_gcode']) assert.throws(() => normalizeOverrides({ [key]: '' }), /Unsupported process setting/);
  assert.throws(() => normalizeOverrides({ process_change_extrusion_role_gcode: 'a'.repeat(65537) }), /64 KB/);
  assert.throws(() => normalizeOverrides({ process_change_extrusion_role_gcode: 'G1\0X1' }), /null character/);
  assert.deepEqual(normalizeOverrides({ process_change_extrusion_role_gcode: '; role change\nG1 X10' }), { process_change_extrusion_role_gcode: '; role change\nG1 X10' });
});

test('post-processing host scripts are disabled by default and only an explicit caller opt-in permits values', () => {
  assert.deepEqual(normalizeOverrides({ post_process: [] }), { post_process: [] });
  assert.throws(() => normalizeOverrides({ post_process: ['/path/to/script'] }), /disabled on the web server/);
  // Only validate text here; no command is executed by this helper or this test.
  assert.deepEqual(normalizeOverrides({ post_process: ['/path/to/script'] }, { allowPostProcess: true }), { post_process: ['/path/to/script'] });
});

test('native defaults fill only when requested, preserving legacy sparse display behavior', () => {
  assert.deepEqual(displayedSettings({}), {});
  const defaults = displayedSettings({}, { includeDefaults: true });
  assert.equal(Object.keys(defaults).length, 342);
  assert.equal(defaults.layer_height, '0.2');
  assert.equal(defaults.ironing_type, 'no ironing');
  assert.equal(defaults.enable_support, false);
  assert.equal(defaults.sparse_infill_density, '20');
  assert.ok(Array.isArray(defaults.small_area_infill_flow_compensation_model));
  const combined = displayedSettings({ layer_height: '0.12' }, { includeDefaults: true });
  assert.equal(combined.layer_height, '0.12');
  assert.equal(combined.ironing_type, defaults.ironing_type);
  assert.equal(Object.keys(normalizeOverrides(defaults)).length, 342);
});
