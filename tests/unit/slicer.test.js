import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlicerArgs } from '../../server/slicer.js';

test('builds OrcaSlicer command line arguments', () => {
  assert.deepEqual(buildSlicerArgs('/in/cube.stl', '/out'), ['--slice', '0', '--outputdir', '/out', '/in/cube.stl']);
  assert.deepEqual(buildSlicerArgs('/in/cube.stl', '/out', '/profile.json'), ['--slice', '0', '--outputdir', '/out', '--load-settings', '/profile.json', '/in/cube.stl']);
});
