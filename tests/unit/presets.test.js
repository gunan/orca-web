import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPresetCatalog, createResolver, applyProcessOverrides, isCompatible, PresetError } from '../../server/presets.js';

const profilesDir = fileURLToPath(new URL('../fixtures/presets/', import.meta.url));
const record = (id, name, data = {}, vendor = 'Test', type = 'process') => ({ id, vendor, type, data: { name, type, ...data } });

test('resolves inheritance within the vendor and preserves native arrays without mutating sources', () => {
  const records = [record('base', 'base', { speed: ['100', '150'], layer_height: '0.2' }), record('other', 'base', { layer_height: '0.5' }, 'Other'), record('child', 'child', { inherits: 'base', layer_height: '0.12' })];
  const resolve = createResolver(records);
  const result = resolve('child');
  assert.equal(result.layer_height, '0.12');
  assert.deepEqual(result.speed, ['100', '150']);
  assert.equal(result.inherits, undefined);
  result.speed[0] = '999';
  assert.equal(resolve('child').speed[0], '100');
  assert.equal(records[2].data.inherits, 'base');
});

test('resolves multiple parents left to right and supports unambiguous cross-vendor inheritance', () => {
  const resolve = createResolver([record('a', 'a', { speed: ['100'], layer_height: '0.2' }, 'Shared'), record('b', 'b', { layer_height: '0.12' }), record('c', 'c', { inherits: ['a', 'b'] })]);
  assert.equal(resolve('c').layer_height, '0.12');
  assert.deepEqual(resolve('c').speed, ['100']);
});

test('rejects missing parents, ambiguous parents, cycles, and unknown IDs', () => {
  assert.throws(() => createResolver([record('a', 'a', { inherits: '../../secret' })])('a'), /Missing parent/);
  assert.throws(() => createResolver([record('a', 'a', { inherits: 'b' }), record('b', 'b', { inherits: 'a' })])('a'), /cycle/);
  assert.throws(() => createResolver([record('a', 'base', {}, 'A'), record('b', 'base', {}, 'B'), record('c', 'child', { inherits: 'base' })])('c'), /Ambiguous parent/);
  assert.throws(() => createResolver([])('nope'), /Unknown preset ID/);
});

test('catalog defaults and compatibility follow actual native presets', async () => {
  const catalog = await createPresetCatalog({ profilesDir });
  const list = catalog.list();
  assert.equal(list.printers.length, 2);
  assert.deepEqual(list.processes.map(p => p.name), ['Test Fine A', 'Test Standard A']);
  assert.deepEqual(list.filaments.map(p => p.name), ['Test PLA A']);
  const configs = catalog.resolveSelection(list.defaults);
  assert.equal(configs.printer.name, 'Test Printer A');
  assert.equal(configs.process.layer_height, '0.2');
  assert.equal(configs.process.from, 'system');
  assert.equal(configs.process.inherits, undefined);
  assert.deepEqual(configs.filament.filament_settings_id, ['Test PLA A']);
  const b = catalog.list({ printerId: list.printers.find(p => p.name === 'Test Printer B').id });
  assert.deepEqual(b.processes.map(p => p.name), ['Test Standard B']);
  assert.throws(() => catalog.resolveSelection({ ...list.defaults, processId: b.defaults.processId }), /incompatible/);
  assert.throws(() => catalog.resolveSelection({ ...list.defaults, printerId: '../../etc/passwd' }), /Unknown machine/);
  assert.throws(() => catalog.list({ printerId: list.defaults.processId }), /Unknown machine/);
});

test('compatibility is conservative about unevaluated expressions', () => {
  assert.equal(isCompatible({ compatible_printers: [] }, { name: 'A' }), true);
  assert.equal(isCompatible({ compatible_printers: ['A'] }, { name: 'B' }), false);
  assert.equal(isCompatible({ compatible_printers_condition: 'printer_model == "A"' }, { name: 'A' }), false);
});

test('process overrides use native types and reject unsupported or invalid settings', () => {
  const original = { outer_wall_speed: ['80', '100'], enable_support: '0', seam_position: 'random' };
  const result = applyProcessOverrides(original, { outer_wall_speed: '150', enable_support: true, seam_position: 'aligned_back', sparse_infill_density: 20, support_type: 'normal(auto)', brim_type: 'auto_brim', ironing_type: 'top', sparse_infill_pattern: 'alignedrectilinear', travel_speed: 1, top_shell_layers: 1000 });
  assert.deepEqual(result.outer_wall_speed, ['150', '150']);
  assert.equal(result.enable_support, '1');
  assert.equal(result.seam_position, 'aligned_back');
  assert.equal(result.sparse_infill_density, '20%');
  assert.equal(result.support_type, 'normal(auto)');
  assert.equal(result.brim_type, 'auto_brim');
  assert.equal(result.ironing_type, 'top');
  assert.equal(result.sparse_infill_pattern, 'alignedrectilinear');
  assert.equal(result.travel_speed, '1');
  assert.equal(result.top_shell_layers, '1000');
  assert.deepEqual(original.outer_wall_speed, ['80', '100']);
  for (const settings of [{ travel_speed: 0 }, { layer_height: 0 }, { layer_height: '' }, { wall_loops: 2.5 }, { top_shell_layers: 2147483648 }, { sparse_infill_density: 101 }, { enable_support: 'yes' }, { machine_start_gcode: 'M112' }, { seam_position: 'Aligned' }, { support_type: 'Normal (auto)' }, { brim_type: 'Auto' }, { ironing: true }]) {
    assert.throws(() => applyProcessOverrides({}, settings), error => error instanceof PresetError && error.status === 400);
  }
});

test('editing another setting preserves the selected preset layer defaults and unsupported native values', async () => {
  const catalog = await createPresetCatalog({ profilesDir });
  const list = catalog.list();
  const processId = list.processes.find(p => p.name === 'Test Fine A').id;
  const result = catalog.resolveSelection({ ...list.defaults, processId, overrides: { wall_loops: 4 } });
  assert.equal(result.process.layer_height, '0.12');
  assert.equal(result.process.initial_layer_print_height, '0.16');
  assert.equal(result.process.wall_loops, '4');
  // Native defaults outside the initial web controls are retained, not revalidated.
  const native = { seam_position: 'native-future-enum', native_future_option: ['42'], initial_layer_print_height: '0.28' };
  const modified = applyProcessOverrides(native, { wall_loops: 3 });
  assert.equal(modified.seam_position, 'native-future-enum');
  assert.deepEqual(modified.native_future_option, ['42']);
  assert.equal(modified.initial_layer_print_height, '0.28');
});


test('native vectors replace their value without becoming nested extruder arrays', () => {
  const source = { small_area_infill_flow_compensation_model: ['0,0', '1,1'] };
  const result = applyProcessOverrides(source, { small_area_infill_flow_compensation_model: ['0,0', '0.2,0.4444'], top_shell_layers: 1001 });
  assert.deepEqual(result.small_area_infill_flow_compensation_model, ['0,0', '0.2,0.4444']);
  assert.deepEqual(source.small_area_infill_flow_compensation_model, ['0,0', '1,1']);
  assert.equal(result.top_shell_layers, '1001');
});
