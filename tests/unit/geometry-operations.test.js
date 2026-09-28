import test from 'node:test';
import assert from 'node:assert/strict';
import { createMesh, transformPositions, meshBounds, sceneBounds, triangleCount, analyzeMesh } from '../../shared/geometry.js';
import { splitDisconnected, assembleMeshes, disassembleMesh, repairMesh } from '../../shared/geometry-operations.js';

function tetra(id, offset = [0,0,0]) {
  const v = [[0,0,0],[10,0,0],[0,10,0],[0,0,10]], faces = [[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
  return createMesh({ id, name: id, positions: faces.flatMap(face => face.flatMap(index => v[index])), position: offset, plateId: 'plate-1' });
}
const close = (a,b) => assert.ok(Math.abs(a-b) < 0.0001, `${a} ≈ ${b}`);

test('split disconnected shells preserves transformed world surfaces and leaves source unchanged', () => {
  const assembly = assembleMeshes([tetra('a'), tetra('b', [30,0,0])], { id: 'assembly' });
  assembly.rotation = [0,0,90]; assembly.scale = [2,1,1]; assembly.position = [20,30,5];
  const before = JSON.stringify(assembly), parts = splitDisconnected(assembly);
  assert.equal(parts.length, 2); assert.equal(triangleCount(parts), 8);
  assert.equal(JSON.stringify(assembly), before);
  assert.deepEqual(sceneBounds(parts), meshBounds(assembly));
  assert.notEqual(parts[0].id, parts[1].id);
  parts.forEach(part => { assert.equal(analyzeMesh(part).manifold, true); assert.deepEqual(part.rotation, [0,0,0]); });
});

test('assembly metadata disassembles parts at current world positions without a Boolean union', () => {
  const input = [tetra('first'), tetra('second', [25,5,0]), { ...tetra('hidden'), visible: false }];
  const assembly = assembleMeshes(input, { id: 'assembly', name: 'Part group' });
  assert.equal(assembly.assemblyParts.length, 2); assert.equal(triangleCount([assembly]), 8);
  assembly.rotation = [20,0,30]; assembly.position = [40,20,0];
  const parts = disassembleMesh(assembly);
  assert.deepEqual(parts.map(part => part.name), ['first','second']);
  assert.deepEqual(parts.flatMap(part => Array.from(transformPositions(part))), Array.from(transformPositions(assembly)));
  assert.throws(() => assembleMeshes([tetra('a'), { ...tetra('b'), plateId: 'plate-2' }]), /same plate/);
  assembly.assemblyParts[1].startTriangle = 0;
  assert.throws(() => disassembleMesh(assembly), /overlap/);
});

test('repair removes degenerate and duplicate faces, fixes isolated winding errors, and retains dimensions', () => {
  const mesh = tetra('damaged', [50,60,0]);
  const original = [...mesh.positions];
  [mesh.positions[3], mesh.positions[6]] = [mesh.positions[6], mesh.positions[3]];
  [mesh.positions[4], mesh.positions[7]] = [mesh.positions[7], mesh.positions[4]];
  [mesh.positions[5], mesh.positions[8]] = [mesh.positions[8], mesh.positions[5]];
  mesh.positions.push(...original.slice(9,18), 0,0,0, 1,0,0, 2,0,0);
  const before = JSON.stringify(mesh), repaired = repairMesh(mesh);
  assert.equal(repaired.report.removedDegenerateTriangles, 1);
  assert.equal(repaired.report.removedDuplicateTriangles, 1);
  assert.equal(repaired.report.flippedTriangles, 1);
  assert.equal(repaired.report.remaining.manifold, true);
  close(repaired.report.remaining.volume, 1000 / 6);
  assert.deepEqual(meshBounds(repaired.mesh).size, [10,10,10]);
  assert.equal(JSON.stringify(mesh), before);
});

test('repair reports open boundaries and does not invent caps or flip nested cavity shells', () => {
  const open = tetra('open'); open.positions.splice(0,9);
  const repaired = repairMesh(open);
  assert.equal(repaired.report.remaining.boundaryEdges, 3);
  assert.equal(repaired.report.remaining.triangles, 3);
  assert.match(repaired.report.warnings[0], /not filled/);
  const outside = tetra('outside'), inside = tetra('inside', [1,1,1]); inside.scale = [0.2,0.2,0.2];
  // Put the smaller shell inside the larger shell and reverse its winding.
  inside.position = [-2.5,-2.5,-2.5];
  for (let i = 0; i < inside.positions.length; i += 9) for (let axis = 0; axis < 3; axis++) [inside.positions[i+3+axis],inside.positions[i+6+axis]] = [inside.positions[i+6+axis],inside.positions[i+3+axis]];
  const assembled = assembleMeshes([outside, inside]);
  const result = repairMesh(assembled);
  const parts = splitDisconnected(result.mesh);
  assert.equal(parts.length, 2);
  assert.ok(parts.some(part => analyzeMesh(part).signedVolume < 0), 'The cavity surface orientation must be preserved');
  assert.throws(() => repairMesh(createMesh({ positions: [0,0,0, 1,0,0, 2,0,0] })), /no valid triangles/);
});
