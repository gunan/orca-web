import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModel, loadModelFile } from '../../src/model-loader.js';
import { createMesh, exportSTL, meshBounds, triangleCount } from '../../shared/geometry.js';

const triangle = [0,0,0, 10,0,0, 0,10,0];

test('STL loader displays actual binary vertices and import placement matches selected bed', async () => {
  const binary = exportSTL([createMesh({ positions: triangle })]);
  const objects = await loadModelFile({ name: 'triangle.stl', arrayBuffer: async () => binary }, { bed: { width: 100, depth: 80, height: 100 } });
  assert.equal(objects.length, 1);
  assert.equal(triangleCount(objects), 1);
  assert.deepEqual(objects[0].positions, triangle);
  assert.deepEqual(meshBounds(objects[0]).center, [50, 40, 0]);
});

test('OBJ loader preserves named surface groups and their relative positions', async () => {
  const obj = 'o Left\nv 0 0 0\nv 10 0 0\nv 0 10 0\nf 1 2 3\no Right\nv 30 0 0\nv 40 0 0\nv 30 10 0\nf 4 5 6\n';
  const objects = await parseModel(obj, 'groups.obj', { bed: { width: 100, depth: 100, height: 100 } });
  assert.deepEqual(objects.map(object => object.name), ['Left', 'Right']);
  assert.equal(triangleCount(objects), 2);
  assert.equal(meshBounds(objects[1]).center[0] - meshBounds(objects[0]).center[0], 30);
  assert.deepEqual(objects.map(object => object.sourceGroup), ['Left', 'Right']);
});

test('empty geometry and unsupported file formats fail instead of rendering placeholder meshes', async () => {
  await assert.rejects(parseModel('solid empty\nendsolid empty\n', 'empty.stl'), /no triangles/);
  await assert.rejects(parseModel('not a model', 'notes.txt'), /STL, OBJ, 3MF, AMF, SVG, or STEP/);
  await assert.rejects(parseModel('', 'empty.obj'), /empty/);
});
