import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOverrides, displayedSettings, settingDefinitions } from '../../shared/settings.js';

test('supported process controls use native enum, boolean, percent, and numeric representations', () => {
  assert.deepEqual(normalizeOverrides({ layer_height: '0.12', enable_support: false, sparse_infill_density: '25', wall_generator: 'arachne', ironing_type: 'top' }), {
    layer_height: '0.12', enable_support: '0', sparse_infill_density: '25%', wall_generator: 'arachne', ironing_type: 'top'
  });
  assert.equal(new Set(settingDefinitions.map(item => item.key)).size, 342);
});

test('rejects unknown, non-finite, fractional integer, out-of-range, and invalid enum settings', () => {
  for (const value of [null, [], { layer_height: '' }, { layer_height: Infinity }, { wall_loops: 1.5 }, { sparse_infill_density: 101 }, { enable_support: 'false' }, { seam_position: 'Aligned' }, { ironing: true }, { machine_start_gcode: 'ignored' }]) {
    assert.throws(() => normalizeOverrides(value));
  }
});

test('display values reflect native preset values, including false strings and vector speeds', () => {
  const preset = { layer_height: '0.28', initial_layer_print_height: '0.28', enable_support: '0', sparse_infill_density: '30%', outer_wall_speed: ['75'], name: 'Draft' };
  assert.deepEqual(displayedSettings(preset), { layer_height: '0.28', initial_layer_print_height: '0.28', sparse_infill_density: '30', outer_wall_speed: '75', enable_support: false });
  assert.equal(displayedSettings({ enable_support: '1' }).enable_support, true);
  assert.deepEqual(normalizeOverrides({ brim_width: '5' }), { brim_width: '5' });
});
