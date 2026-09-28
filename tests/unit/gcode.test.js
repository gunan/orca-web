import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGcode } from '../../shared/gcode.js';
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);
const prefix = 'G21\nG90\nM82\nG92 X0 Y0 Z0 E0\n';

test('tracks native layer/feature comments, feed rates, tools and genuine header estimates', () => {
  const result = parseGcode(prefix + '; estimated printing time (normal mode) = 2m 10s\n; filament used [g] = 1.23\n;LAYER_CHANGE\n;Z:0.2\n;TYPE:Outer wall\nG1 Z0.2 F600\nG1 X10 E1 F1200\n;LAYER_CHANGE\n;Z:0.4\nT1\nG1 Z0.4\n;FEATURE:Sparse infill\nG1 Y10 E2\n');
  assert.equal(result.layers.length, 2);
  assert.deepEqual(result.layers.map(layer => layer.z), [0.2, 0.4]);
  assert.equal(result.segments[1].feature, 'Outer wall');
  assert.equal(result.segments.at(-1).tool, 1);
  assert.equal(result.segments.at(-1).speed, 20);
  assert.equal(result.segments.at(-1).layer, 1);
  assert.deepEqual(result.nativeEstimates, { printTime: '2m 10s', filamentGrams: '1.23' });
  near(result.metrics.extrusionMm, 2);
  assert.deepEqual(result.bounds, { min: [0, 0, 0], max: [10, 10, 0.4] });
});

test('absolute/relative axes and M82/M83 extrusion modes remain explicit across G92 resets', () => {
  const result = parseGcode(prefix + 'G1 X10 E2\nG91\nM83\nG1 X5 Y2 E0.5\nG92 X0 E0\nG90\nM82\nG1 X4 Y4 E1\n');
  assert.deepEqual(result.segments.map(segment => segment.end), [[10, 0, 0], [15, 2, 0], [4, 4, 0]]);
  assert.deepEqual(result.segments.map(segment => segment.extrusion), [2, 0.5, 1]);
  near(result.metrics.extrusionMm, 3.5);
});

test('distinguishes extrusion, travel, moving retraction and stationary retraction/unretraction', () => {
  const result = parseGcode(prefix + 'G1 X10 E1\nG1 E0\nG1 X12\nG1 E1\nG1 X14 E0.5\n');
  assert.deepEqual(result.segments.map(segment => segment.kind), ['extrusion', 'travel', 'retraction']);
  near(result.metrics.retractionMm, 1.5);
  near(result.metrics.unretractionMm, 1);
  near(result.metrics.travelMm, 4);
  assert.equal(result.segments.length, 3);
});

test('tessellates clockwise/counterclockwise IJ arcs, full circles and helical Z motion', () => {
  const ccw = parseGcode(prefix + 'G92 X10\nG3 X0 Y10 I-10 J0 E1 F1200\n');
  assert.ok(ccw.segments.length > 2);
  assert.deepEqual(ccw.segments.at(-1).end, [0, 10, 0]);
  assert.ok(ccw.segments.every(segment => segment.end[0] >= -1e-6 && segment.end[1] >= -1e-6));
  near(ccw.metrics.extrusionPathMm, Math.PI * 5, 0.05);
  near(ccw.metrics.extrusionMm, 1);
  const cw = parseGcode(prefix + 'G92 X10\nG2 X0 Y-10 I-10 J0 E1\n');
  assert.ok(cw.segments.every(segment => segment.end[1] <= 1e-6));
  const circle = parseGcode(prefix + 'G92 X10\nG3 I-10 J0 Z2 E2\n');
  assert.deepEqual(circle.segments.at(-1).end, [10, 0, 2]);
  assert.ok(circle.segments.some(segment => segment.end[0] < -9));
  near(circle.metrics.extrusionMm, 2);
});

test('supports radius-defined minor/major arcs and alternate planes without flattening them', () => {
  const minor = parseGcode(prefix + 'G92 X10\nG3 X0 Y10 R10 E1\n');
  const major = parseGcode(prefix + 'G92 X10\nG3 X0 Y10 R-10 E1\n');
  assert.ok(major.metrics.pathLengthMm > minor.metrics.pathLengthMm * 2.9);
  const yz = parseGcode(prefix + 'G19\nG92 Y10\nG3 Y0 Z10 J-10 K0 E1\n');
  assert.deepEqual(yz.segments.at(-1).end, [0, 0, 10]);
  assert.ok(yz.segments.every(segment => segment.end[0] === 0));
  const xz = parseGcode(prefix + 'G18\nG92 Z10\nG3 Z0 X10 K-10 I0 E1\n');
  assert.deepEqual(xz.segments.at(-1).end, [10, 0, 0]);
});

test('invalid arcs are reported and omitted rather than converted into fabricated straight paths', () => {
  const result = parseGcode(prefix + 'G2 X20 Y0 R1 E1\nG1 Y10 E2\n');
  assert.equal(result.segments.length, 1);
  assert.deepEqual(result.segments[0].start, [20, 0, 0]);
  assert.ok(result.warnings.some(warning => warning.includes('Invalid or unsupported arcs')));
  assert.equal(result.metrics.skippedMoves, 1);
});

test('unknown starting coordinates and homing do not produce invented moves', () => {
  const result = parseGcode('G1 X10 Y10 Z0.2 E1\nG1 X20 E2\nG28\nG1 X0 Y0 Z1\nG1 X2 E3\n');
  assert.equal(result.segments.length, 2);
  assert.deepEqual(result.segments[0].start, [10, 10, 0.2]);
  assert.deepEqual(result.segments[1].start, [0, 0, 1]);
  assert.equal(result.metrics.skippedMoves, 2);
  assert.ok(result.warnings.some(warning => warning.includes('Homing')));
});

test('commentless layers use extruding Z and ignore non-extruding Z-hop heights', () => {
  const result = parseGcode(prefix + 'G1 Z0.2\nG1 X10 E1\nG1 Z1\nG1 X11\nG1 Z0.2\nG1 Y10 E2\nG1 Z0.4\nG1 X1 E3\n');
  assert.deepEqual(result.layers.map(layer => layer.z), [0.2, 0.4]);
  assert.equal(result.layers[0].extrusionSegments, 2);
});

test('duplicate native layer comments annotate one layer and missing native estimates remain absent', () => {
  const result = parseGcode(prefix + ';LAYER_CHANGE\n;LAYER:0\n; layer num/total_layer_count: 1/2\nG1 X1 Z0.2 E1\n;LAYER_CHANGE\nG1 X2 Z0.4 E2\n');
  assert.equal(result.layers.length, 2);
  assert.deepEqual(result.layers.map(layer => layer.z), [0.2, 0.4]);
  assert.deepEqual(result.nativeEstimates, {});
});

test('caps segments, lines, characters and arc subdivision with explicit partial-preview diagnostics', () => {
  const gcode = prefix + 'G1 X1 E1\nG1 X2 E2\nG1 X3 E3\n';
  const capped = parseGcode(gcode, { maxSegments: 2 });
  assert.equal(capped.segments.length, 2);
  assert.equal(capped.truncated, true);
  near(capped.metrics.extrusionMm, 2);
  assert.equal(parseGcode(gcode, { maxLines: 4 }).truncated, true);
  assert.equal(parseGcode(gcode, { maxCharacters: 20 }).truncated, true);
  const layers = parseGcode(prefix + ';LAYER_CHANGE\nG1 X1 E1\n;LAYER_CHANGE\nG1 X2 E2\n', { maxLayers: 1 });
  assert.equal(layers.layers.length, 1);
  assert.equal(layers.truncated, true);
  const arc = parseGcode(prefix + 'G92 X10\nG3 I-10 J0 E1\n', { maxArcSegments: 3 });
  assert.equal(arc.segments.length, 3);
  assert.ok(arc.warnings.some(warning => warning.includes('tessellation')));
});

test('parses inches, modal moves, comments, compact commands, line numbers and checksum suffixes', () => {
  const result = parseGcode(prefix + 'G20\nN1G1X1E0.1F60*21\nX2E0.2 (end move)\nF120\nX3E0.3\n');
  near(result.segments[0].end[0], 25.4);
  near(result.segments[0].speed, 25.4);
  near(result.segments.at(-1).speed, 50.8);
  near(result.metrics.extrusionMm, 7.62);
  assert.equal(parseGcode('; no movement here').segments.length, 0);
  assert.throws(() => parseGcode(null), TypeError);
});

test('absolute arc-center mode and coordinate safety limits are respected', () => {
  const result = parseGcode(prefix + 'G92 X10 Y10\nG90.1\nG3 X0 Y20 I0 J10 E1\n');
  assert.deepEqual(result.segments.at(-1).end, [0, 20, 0]);
  const huge = parseGcode(prefix + 'G1 X9999999999 E1\n');
  assert.equal(huge.segments.length, 0);
  assert.ok(huge.warnings.some(warning => warning.includes('out-of-range')));
});

test('Orca setup/purge paths do not shift one-based printed layer labels', () => {
  const result = parseGcode(prefix + ';TYPE:Custom\nG1 X10 E1\n;LAYER_CHANGE\n;Z:0.2\n;TYPE:Inner wall\nG1 X20 Z0.2 E2\n;LAYER_CHANGE\n;Z:0.32\nG1 X10 Z0.32 E3\n; filament used [mm] = 3.00\n; estimated printing time (normal mode) = 51m 44s\n');
  assert.deepEqual(result.layers.map(layer => layer.number), [null, 1, 2]);
  assert.equal(result.layers[0].preamble, true);
  assert.equal(result.nativeEstimates.filamentMm, '3.00');
  assert.equal(result.nativeEstimates.printTime, '51m 44s');
});
