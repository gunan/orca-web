import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Matrix4, Vector3 } from 'three';
import { createMesh, sourceBounds, meshBounds, sceneBounds, triangleCount, transformPositions, translateMesh, placeOnBed, dropToBed, placeObjectsOnBed, duplicateObject, removeObject, fitsOnBed, arrangeObjects, analyzeMesh, exportSTL, placeOnFace } from '../../shared/geometry.js';

function box({ id = 'box', size = [20, 10, 5], origin = [0, 0, 0], ...rest } = {}) {
  const vertices = [[0,0,0], [1,0,0], [1,1,0], [0,1,0], [0,0,1], [1,0,1], [1,1,1], [0,1,1]].map(point => point.map((value, axis) => value * size[axis] + origin[axis]));
  const faces = [[0,2,1], [0,3,2], [4,5,6], [4,6,7], [0,1,5], [0,5,4], [1,2,6], [1,6,5], [2,3,7], [2,7,6], [3,0,4], [3,4,7]];
  return createMesh({ id, name: id, positions: faces.flatMap(face => face.flatMap(index => vertices[index])), ...rest });
}
const near = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const nearVector = (actual, expected) => actual.forEach((value, axis) => near(value, expected[axis]));

test('transforms rotate and scale about source center while position is world translation', () => {
  const mesh = box({ origin: [10, 20, 30], position: [3, 4, 5], rotation: [0, 0, 90], scale: [2, 1, 1] });
  const original = [...mesh.positions];
  const bounds = meshBounds(mesh);
  nearVector(bounds.size, [10, 40, 5]);
  nearVector(bounds.center, [23, 29, 37.5]);
  assert.deepEqual(mesh.positions, original);
  assert.equal(triangleCount([mesh]), 12);
  assert.ok(transformPositions(mesh) instanceof Float32Array);
});

test('combined Euler rotation matches Three.js XYZ convention used by the viewport', () => {
  const mesh = box({ rotation: [23, -41, 67], scale: [1.2, 0.7, 2], position: [-5, 8, 12] });
  const center = sourceBounds(mesh).center;
  const rotation = new Matrix4().makeRotationFromEuler(new Euler(...mesh.rotation.map(angle => angle * Math.PI / 180), 'XYZ'));
  const actual = transformPositions(mesh);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const expected = new Vector3(...mesh.positions.slice(index, index + 3)).sub(new Vector3(...center)).multiply(new Vector3(...mesh.scale)).applyMatrix4(rotation).add(new Vector3(...center)).add(new Vector3(...mesh.position));
    nearVector(Array.from(actual.slice(index, index + 3)), expected.toArray());
  }
});

test('bed placement centers XY and drops transformed minimum Z while imported assemblies keep offsets', () => {
  const bed = { min: [-100, -80, 0], max: [100, 80, 150] };
  const mesh = box({ rotation: [35, 20, 15], position: [90, -20, 70] });
  const placed = placeOnBed(mesh, bed), bounds = meshBounds(placed);
  nearVector(bounds.center.slice(0, 2), [0, 0]);
  near(bounds.min[2], 0);
  assert.deepEqual(placed.rotation, mesh.rotation);
  assert.equal(fitsOnBed(placed, bed), true);
  const other = translateMesh(box({ id: 'other' }), [30, 0, 4]);
  const originalOffset = meshBounds(other).center.map((value, axis) => value - meshBounds(mesh).center[axis]);
  const assembly = placeObjectsOnBed([mesh, other], bed);
  const movedOffset = meshBounds(assembly[1]).center.map((value, axis) => value - meshBounds(assembly[0]).center[axis]);
  nearVector(movedOffset, originalOffset);
  near(sceneBounds(assembly).min[2], 0);
  near(meshBounds(dropToBed(mesh, bed)).min[2], 0);
});

test('scene bounds, duplicate, remove and hidden objects use independent serializable meshes', () => {
  const first = box({ plateId: 'plate-1' });
  const hidden = box({ id: 'hidden', position: [1000, 1000, 1000], visible: false });
  const scene = duplicateObject([first, hidden], first.id, { newId: 'copy', offset: [30, 0, 0] });
  assert.equal(scene.length, 3);
  assert.equal(scene[2].plateId, 'plate-1');
  scene[2].positions[0] = 5;
  assert.equal(first.positions[0], 0);
  assert.equal(triangleCount(scene), 24);
  nearVector(sceneBounds([first, hidden]).size, [20, 10, 5]);
  assert.equal(removeObject(scene, 'copy').length, 2);
  assert.equal(sceneBounds([]), null);
  assert.throws(() => duplicateObject(scene, 'missing'), /not found/);
  assert.throws(() => duplicateObject(scene, first.id, { newId: 'hidden' }), /ID/);
});

test('arrange keeps transformed boxes inside build volume with nonoverlapping XY footprints', () => {
  const bed = { width: 100, depth: 90, height: 100 };
  const meshes = Array.from({ length: 8 }, (_, index) => box({ id: `box-${index}`, rotation: [0, 0, index % 2 ? 90 : 0], position: [100, 200, 30] }));
  const original = JSON.stringify(meshes);
  const arranged = arrangeObjects(meshes, bed, { gap: 3, margin: 5 });
  assert.equal(JSON.stringify(meshes), original);
  for (const mesh of arranged) { assert.equal(fitsOnBed(mesh, bed), true); near(meshBounds(mesh).min[2], 0); }
  for (let first = 0; first < arranged.length; first++) for (let second = first + 1; second < arranged.length; second++) {
    const a = meshBounds(arranged[first]), b = meshBounds(arranged[second]);
    assert.ok(a.max[0] + 3 <= b.min[0] + 1e-5 || b.max[0] + 3 <= a.min[0] + 1e-5 || a.max[1] + 3 <= b.min[1] + 1e-5 || b.max[1] + 3 <= a.min[1] + 1e-5);
  }
  assert.throws(() => arrangeObjects([box({ size: [200, 20, 20] })], bed), /too large/);
  assert.throws(() => arrangeObjects(meshes, { width: 25, depth: 25, height: 100 }), /fit|large/);
});

test('mesh analysis identifies closed topology, open boundaries, degeneracy and duplicate faces', () => {
  const mesh = box();
  const closed = analyzeMesh(mesh);
  assert.equal(closed.triangles, 12);
  assert.equal(closed.vertices, 8);
  assert.equal(closed.manifold, true);
  assert.equal(closed.connectedComponents, 1);
  near(closed.volume, 1000);
  near(closed.surfaceArea, 700);
  const open = analyzeMesh(createMesh({ positions: mesh.positions.slice(9) }));
  assert.equal(open.watertight, false);
  assert.equal(open.boundaryEdges, 3);
  const duplicate = analyzeMesh(createMesh({ positions: [...mesh.positions, ...mesh.positions.slice(0, 9)] }));
  assert.equal(duplicate.duplicateTriangles, 1);
  assert.equal(duplicate.nonManifoldEdges, 3);
  const degenerate = analyzeMesh(createMesh({ positions: [0,0,0, 1,0,0, 2,0,0] }));
  assert.equal(degenerate.degenerateTriangles, 1);
  assert.equal(degenerate.manifold, false);
});

test('binary STL includes only visible triangles with baked transforms and repaired mirrored winding', () => {
  const first = box({ rotation: [10, 20, 30], position: [10, 30, 20], scale: [-1, 2, 1] });
  const second = box({ id: 'second', position: [100, 0, 0] });
  const hidden = box({ visible: false });
  const binary = exportSTL([first, second, hidden]), data = new DataView(binary);
  assert.equal(data.getUint32(80, true), 24);
  assert.equal(binary.byteLength, 84 + 24 * 50);
  const positions = [];
  for (let offset = 84; offset < binary.byteLength; offset += 50) {
    const normal = [0, 1, 2].map(axis => data.getFloat32(offset + axis * 4, true));
    near(Math.hypot(...normal), 1);
    for (let index = 0; index < 9; index++) positions.push(data.getFloat32(offset + 12 + index * 4, true));
  }
  const exported = createMesh({ positions });
  nearVector(meshBounds(exported).min, sceneBounds([first, second]).min);
  nearVector(meshBounds(exported).max, sceneBounds([first, second]).max);
  near(analyzeMesh(exported).volume, 3000, 0.01);
  assert.throws(() => exportSTL([hidden]), /No visible/);
});

test('place on face rotates an outward side normal down, retains XY center and resets transforms', () => {
  const mesh = box({ position: [50, 60, 30], scale: [2, 1, 1] });
  const originalCenter = meshBounds(mesh).center;
  const placed = placeOnFace(mesh, [1, 0, 0], { width: 200, depth: 200, height: 200 });
  nearVector(meshBounds(placed).size, [5, 10, 40]);
  nearVector(meshBounds(placed).center.slice(0, 2), originalCenter.slice(0, 2));
  near(meshBounds(placed).min[2], 0);
  assert.deepEqual(placed.rotation, [0, 0, 0]);
  assert.deepEqual(placed.scale, [1, 1, 1]);
  // The original +X side is triangles 6 and 7; its resulting normal is down.
  const p = placed.positions.slice(6 * 9, 7 * 9);
  const ab = new Vector3(p[3] - p[0], p[4] - p[1], p[5] - p[2]);
  const ac = new Vector3(p[6] - p[0], p[7] - p[1], p[8] - p[2]);
  nearVector(ab.cross(ac).normalize().toArray(), [0, 0, -1]);
  near(meshBounds(placeOnFace(mesh, [0, 0, 1])).min[2], 0);
  assert.throws(() => placeOnFace(mesh, [0, 0, 0]), /cannot be zero/);
});

test('invalid input coordinates and zero scale are rejected before geometry export', () => {
  assert.throws(() => createMesh({ positions: [0, 0, 0] }), /complete/);
  assert.throws(() => createMesh({ positions: [0,0,0, 1,0,0, 0,NaN,0] }), /finite/);
  assert.throws(() => box({ scale: [1, 0, 1] }), /zero/);
});
