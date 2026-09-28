import { ShapeUtils, Vector2 } from 'three';
import { createMesh, placeOnBed, fitsOnBed, transformPositions } from './geometry.js';

// Plane clipping keeps the native model's labels/features; it does not replace
// them with a generic tower. Caps support separate outlines and enclosed holes.
const keyOf = point => point.slice(0, 2).map(value => Math.round(value * 1e6)).join(',');
const insidePolygon = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

export function clipAtZ(positions, plane, keepAbove) {
  if (!Number.isFinite(plane) || !positions?.length || positions.length % 9) throw new Error('Invalid calibration clipping geometry');
  const triangles = [], cuts = [], sign = keepAbove ? 1 : -1;
  for (let offset = 0; offset < positions.length; offset += 9) {
    const polygon = [0, 3, 6].map(index => Array.from(positions.slice(offset + index, offset + index + 3)));
    const clipped = [], intersection = [];
    for (let index = 0; index < 3; index++) {
      const a = polygon[index], b = polygon[(index + 1) % 3], aInside = sign * (a[2] - plane) >= 0, bInside = sign * (b[2] - plane) >= 0;
      if (aInside) clipped.push(a);
      if (aInside !== bInside) {
        const t = (plane - a[2]) / (b[2] - a[2]);
        // Weld sub-micron intersection noise before triangulating the cap.
        // Binary STL positions are float32; tiny differences disappear on
        // export and would otherwise turn cap triangles into zero-area faces.
        const snap = value => Math.round(value * 1e4) / 1e4;
        const point = [snap(a[0] + t * (b[0] - a[0])), snap(a[1] + t * (b[1] - a[1])), plane];
        clipped.push(point); intersection.push(point);
      }
    }
    for (let index = 1; index + 1 < clipped.length; index++) triangles.push(...clipped[0], ...clipped[index], ...clipped[index + 1]);
    if (intersection.length === 2 && keyOf(intersection[0]) !== keyOf(intersection[1])) cuts.push(intersection);
  }
  if (!triangles.length) throw new Error('Calibration range leaves no geometry');
  if (!cuts.length) return triangles;
  const vertices = new Map(), edges = new Map();
  for (const [a, b] of cuts) {
    const ka = keyOf(a), kb = keyOf(b); vertices.set(ka, a); vertices.set(kb, b);
    for (const [from, to] of [[ka, kb], [kb, ka]]) { if (!edges.has(from)) edges.set(from, new Set()); edges.get(from).add(to); }
  }
  if ([...edges.values()].some(neighbors => neighbors.size !== 2)) throw new Error('Native calibration model cut has an ambiguous boundary');
  const loops = [], visited = new Set();
  for (const first of edges.keys()) {
    if (visited.has(first)) continue;
    const loop = []; let current = first, previous;
    do {
      if (visited.has(current)) throw new Error('Calibration cut boundary is not a closed loop');
      visited.add(current); loop.push(vertices.get(current));
      const next = [...edges.get(current)].find(vertex => vertex !== previous); previous = current; current = next;
    } while (current !== first);
    if (loop.length < 3) throw new Error('Calibration cut boundary has no area');
    loops.push(loop);
  }
  const depth = loops.map((loop, index) => loops.reduce((total, other, otherIndex) => total + (index !== otherIndex && insidePolygon(loop[0], other) ? 1 : 0), 0));
  for (let index = 0; index < loops.length; index++) {
    if (depth[index] % 2) continue;
    const outline = loops[index], holes = loops.filter((loop, j) => depth[j] === depth[index] + 1 && insidePolygon(loop[0], outline));
    const contour = outline.map(point => new Vector2(point[0], point[1]));
    const holePoints = holes.map(loop => loop.map(point => new Vector2(point[0], point[1])));
    const points = [...outline, ...holes.flat()];
    const caps = ShapeUtils.triangulateShape(contour, holePoints);
    if (!caps.length) throw new Error('Native calibration model cut could not be capped');
    for (const indices of caps) {
      const corners = indices.map(id => points[id]);
      const [a, b, c] = corners;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-8) continue;
      const perimeter = [];
      // Earcut removes collinear vertices. Restore all such boundary vertices
      // so cap and side edges share identical topology instead of T-junctions.
      for (let edge = 0; edge < 3; edge++) {
        const from = corners[edge], to = corners[(edge + 1) % 3];
        const dx = to[0] - from[0], dy = to[1] - from[1], length2 = dx * dx + dy * dy;
        const between = points.map(point => ({ point, t: ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / length2 }))
          .filter(({ point, t }) => t > 1e-9 && t < 1 - 1e-9 && Math.abs(dx * (point[1] - from[1]) - dy * (point[0] - from[0])) < 1e-7)
          .sort((first, second) => first.t - second.t);
        perimeter.push(from, ...between.map(item => item.point));
      }
      const center = [corners.reduce((sum, point) => sum + point[0], 0) / 3, corners.reduce((sum, point) => sum + point[1], 0) / 3, plane];
      for (let edge = 0; edge < perimeter.length; edge++) {
        const from = perimeter[edge], to = perimeter[(edge + 1) % perimeter.length];
        triangles.push(...center, ...((area > 0) === keepAbove ? to : from), ...((area > 0) === keepAbove ? from : to));
      }
    }
  }
  return triangles;
}

export function prepareCalibrationMesh(positions, plan, bed) {
  const epsilon = plan.request.mode === 'temperature' ? 1e-3 : 0; // 1 µm inset avoids float32 collapse at labelled block surfaces; see provenance notes.
  let output = Array.from(positions);
  let highest = -Infinity;
  for (let index = 2; index < output.length; index += 3) highest = Math.max(highest, output[index]);
  if (plan.model.maxZ < highest) output = clipAtZ(output, plan.model.maxZ - epsilon, false);
  if (plan.model.minZ > 0) output = clipAtZ(output, plan.model.minZ + epsilon, true);
  for (let offset = 0; offset < output.length; offset += 3) {
    output[offset] *= plan.model.scale; output[offset + 1] *= plan.model.scale;
    output[offset + 2] = (output[offset + 2] - plan.model.minZ) * plan.model.scale;
  }
  const placed = placeOnBed(createMesh({ name: plan.label, positions: output, sourceFormat: 'native-calibration', sourceFile: plan.model.resource, calibrationMode: plan.request.mode }), bed);
  const baked = transformPositions(placed);
  for (let index = 2; index < baked.length; index += 3) if (Math.abs(baked[index]) < 1e-6) baked[index] = 0;
  const mesh = createMesh({ ...placed, positions: baked, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
  if (!fitsOnBed(mesh, bed)) throw new Error('Calibration model does not fit the selected bed');
  return mesh;
}
