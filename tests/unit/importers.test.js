import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import createOCCT from 'occt-import-js';
import { zipSync, strToU8, strFromU8 } from 'fflate';
import { importLimits, extractBoundedZip } from '../../shared/import-limits.js';
import { svgDimensions, stepParameters, stepMeshes } from '../../src/importers.js';
import { parseModel, loadModelFile } from '../../src/model-loader.js';
import { sceneBounds, triangleCount, analyzeMesh } from '../../shared/geometry.js';

test('SVG physical units, viewBox mapping and scale leave extrusion depth in millimetres', () => {
  const metric = svgDimensions({ width: '20mm', height: '10mm', viewBox: '0 0 200 100' }, { svgDepth: 3, svgScale: 2 });
  assert.equal(metric.scaleX, 0.2); assert.equal(metric.scaleY, 0.2); assert.equal(metric.depth, 3);
  const inches = svgDimensions({ width: '1in', height: '1in', viewBox: '0 0 96 96' });
  assert.equal(inches.scaleX * 96, 25.4);
  const aspect = svgDimensions({ width: '40mm', height: '20mm', viewBox: '10 20 100 100' });
  assert.equal(aspect.scaleX, 0.2); assert.equal(aspect.offsetX, 8); assert.equal(aspect.offsetY, -4);
  const stretch = svgDimensions({ width: '40mm', height: '20mm', viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
  assert.equal(stretch.scaleX, 0.4); assert.equal(stretch.scaleY, 0.2);
  assert.match(svgDimensions({}).warnings[0], /96 DPI/);
  for (const options of [{ svgDepth: 0 }, { svgScale: -1 }, { svgDPI: Infinity }]) assert.throws(() => svgDimensions({}, options));
  assert.throws(() => svgDimensions({ width: '100%' }), /explicit lengths/);
});

test('bounded ZIP reader accepts stored/deflated entries and rejects oversized or forged expansions', () => {
  for (const level of [0, 6]) {
    const zip = zipSync({ 'a.txt': strToU8('hello'), 'folder/b.txt': strToU8('world') }, { level });
    const files = extractBoundedZip(zip);
    assert.equal(strFromU8(files['a.txt']), 'hello'); assert.equal(strFromU8(files['folder/b.txt']), 'world');
    assert.throws(() => extractBoundedZip(zip, { maxExpandedBytes: 5 }), /expanded size/);
    assert.throws(() => extractBoundedZip(zip, { maxZipEntries: 1 }), /too many/);
  }
  const unsafe = zipSync({ '../secret': strToU8('bad') });
  assert.throws(() => extractBoundedZip(unsafe), /Unsafe/);
  const bomb = zipSync({ 'bomb.txt': new Uint8Array(1000000) });
  const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);
  view.setUint32(22, 16, true); // Forge local expanded size.
  for (let index = 0; index < bomb.length - 46; index++) if (view.getUint32(index, true) === 0x02014b50) { view.setUint32(index + 24, 16, true); break; }
  assert.throws(() => extractBoundedZip(bomb, { maxExpandedBytes: 1000 }), /actual expanded/);
  assert.throws(() => extractBoundedZip(new Uint8Array(20)), /directory/);
  assert.throws(() => importLimits({ maxTriangles: Infinity }), /Invalid/);
});

test('file limits apply before reading file bytes and triangle limits before STL/OBJ expansion', async () => {
  let read = false;
  await assert.rejects(loadModelFile({ name: 'large.stl', size: 100, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } }, { limits: { maxFileBytes: 99 } }), /byte import limit/);
  assert.equal(read, false);
  const binary = new ArrayBuffer(84); new DataView(binary).setUint32(80, 10000000, true);
  await assert.rejects(parseModel(binary, 'huge.stl'), /triangle import limit/);
  const obj = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4';
  await assert.rejects(parseModel(obj, 'quad.obj', { limits: { maxTriangles: 1 } }), /triangle import limit/);
});

test('STEP mesh conversion preserves assembly names, rejects bad indices and enforces mesh budgets', () => {
  const result = { success: true, root: { name: 'assembly', children: [{ name: 'part', meshes: [0] }] }, meshes: [{ name: 'triangle', attributes: { position: { array: [0,0,0, 1,0,0, 0,1,0] } }, index: { array: [0,1,2] } }] };
  assert.equal(stepMeshes(result, 'test.step')[0].sourceGroup, 'assembly/part');
  assert.deepEqual(stepParameters({ stepLinearDeflection: 0.2 }), { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: 0.2, angularDeflection: 0.5 });
  assert.throws(() => stepParameters({ stepLinearDeflection: 0 }), /deflection/);
  result.meshes[0].index.array[0] = 99;
  assert.throws(() => stepMeshes(result, 'bad.step'), /vertex index/);
});

test('official OpenCascade WASM tessellates upstream STEP cube into actual closed surfaces', { timeout: 120000 }, async () => {
  const engine = await createOCCT({ print: () => {}, printErr: () => {} });
  const bytes = await readFile(new URL('../fixtures/occt-cube.step', import.meta.url));
  const objects = await parseModel(bytes, 'cube.step', { place: false, stepEngine: engine, stepLinearDeflection: 0.1 });
  assert.equal(triangleCount(objects), 12);
  assert.deepEqual(sceneBounds(objects).size, [300, 300, 300]);
  assert.equal(analyzeMesh(objects[0]).manifold, true);
  assert.match(objects[0].importWarnings[0], /0.1 mm/);
});
