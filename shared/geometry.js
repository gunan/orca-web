/**
 * Serializable scene meshes contain triangle-soup positions in millimetres.
 * world = sourceBounds.center + position + R_XYZ(scale * (source - center)).
 * XYZ uses Three.js's intrinsic Euler convention; source positions stay intact.
 * position is a world-space translation, not an absolute center coordinate.
 */
const EPSILON = 1e-7;
const vector = (value, fallback, label) => {
  const result = value == null ? [...fallback] : Array.from(value);
  if (result.length !== 3 || !result.every(Number.isFinite)) throw new Error(`${label} must contain three finite numbers`);
  return result;
};
const meshId = () => globalThis.crypto?.randomUUID?.() || `mesh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const visibleObjects = objects => objects.filter(object => object.visible !== false);

function validatePositions(positions) {
  if ((!Array.isArray(positions) && !ArrayBuffer.isView(positions)) || positions.length % 9 !== 0) throw new Error('Mesh positions must contain complete xyz triangles');
  for (const value of positions) if (!Number.isFinite(value)) throw new Error('Mesh positions must be finite numbers');
  return positions;
}

export function createMesh({ id = meshId(), name = 'Object', positions, position, rotation, scale, visible = true, ...metadata }) {
  validatePositions(positions);
  const scaling = vector(scale, [1, 1, 1], 'Scale');
  if (scaling.some(value => value === 0)) throw new Error('Scale cannot be zero');
  return { ...metadata, id, name, positions: Array.from(positions), position: vector(position, [0, 0, 0], 'Position'), rotation: vector(rotation, [0, 0, 0], 'Rotation'), scale: scaling, visible: Boolean(visible) };
}

function boundsOf(positions) {
  if (!positions.length) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], positions[i + axis]);
    max[axis] = Math.max(max[axis], positions[i + axis]);
  }
  return { min, max, size: max.map((value, axis) => value - min[axis]), center: max.map((value, axis) => (value + min[axis]) / 2) };
}

export function sourceBounds(mesh) { return boundsOf(validatePositions(mesh.positions)); }

export function transformPositions(mesh) {
  const positions = validatePositions(mesh.positions);
  const output = new Float32Array(positions.length);
  const bounds = boundsOf(positions);
  if (!bounds) return output;
  const position = vector(mesh.position, [0, 0, 0], 'Position');
  const scale = vector(mesh.scale, [1, 1, 1], 'Scale');
  if (scale.some(value => value === 0)) throw new Error('Scale cannot be zero');
  const [rx, ry, rz] = vector(mesh.rotation, [0, 0, 0], 'Rotation').map(angle => angle * Math.PI / 180);
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  for (let i = 0; i < positions.length; i += 3) {
    const x = (positions[i] - bounds.center[0]) * scale[0];
    const y = (positions[i + 1] - bounds.center[1]) * scale[1];
    const z = (positions[i + 2] - bounds.center[2]) * scale[2];
    // R = Rx * Ry * Rz, matching THREE.Euler(x, y, z, 'XYZ').
    const zx = cz * x - sz * y, zy = sz * x + cz * y;
    const yx = cy * zx + sy * z, yz = -sy * zx + cy * z;
    output[i] = yx + bounds.center[0] + position[0];
    output[i + 1] = cx * zy - sx * yz + bounds.center[1] + position[1];
    output[i + 2] = sx * zy + cx * yz + bounds.center[2] + position[2];
    if (!Number.isFinite(output[i]) || !Number.isFinite(output[i + 1]) || !Number.isFinite(output[i + 2])) throw new Error('Transformed mesh coordinates exceed the supported range');
  }
  return output;
}

export function meshBounds(mesh) { return boundsOf(transformPositions(mesh)); }

export function sceneBounds(objects) {
  const bounds = visibleObjects(objects).map(meshBounds).filter(Boolean);
  if (!bounds.length) return null;
  const min = [0, 1, 2].map(axis => Math.min(...bounds.map(bound => bound.min[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...bounds.map(bound => bound.max[axis])));
  return { min, max, size: max.map((value, axis) => value - min[axis]), center: max.map((value, axis) => (value + min[axis]) / 2) };
}

export function triangleCount(objects) { return visibleObjects(objects).reduce((sum, mesh) => sum + validatePositions(mesh.positions).length / 9, 0); }

export function bedBounds(bed = {}) {
  if (bed.min && bed.max) {
    const min = vector(bed.min, [0, 0, 0], 'Bed minimum'), max = vector(bed.max, [256, 256, 256], 'Bed maximum');
    if (max.some((value, axis) => value <= min[axis])) throw new Error('Bed dimensions must be positive');
    return { min, max, size: max.map((value, axis) => value - min[axis]), center: max.map((value, axis) => (value + min[axis]) / 2) };
  }
  const min = vector(bed.origin, [0, 0, 0], 'Bed origin');
  const size = [bed.width ?? 256, bed.depth ?? 256, bed.height ?? 256];
  if (!size.every(value => Number.isFinite(value) && value > 0)) throw new Error('Bed dimensions must be positive');
  return { min, size, max: size.map((value, axis) => min[axis] + value), center: size.map((value, axis) => min[axis] + value / 2) };
}

export function translateMesh(mesh, delta) {
  const movement = vector(delta, [0, 0, 0], 'Translation');
  const position = vector(mesh.position, [0, 0, 0], 'Position');
  return { ...mesh, position: position.map((value, axis) => value + movement[axis]) };
}

export function centerOnBed(mesh, bed) {
  const bounds = meshBounds(mesh);
  if (!bounds) return { ...mesh };
  const target = bedBounds(bed);
  return translateMesh(mesh, [target.center[0] - bounds.center[0], target.center[1] - bounds.center[1], 0]);
}

export function dropToBed(mesh, bed) {
  const bounds = meshBounds(mesh);
  return bounds ? translateMesh(mesh, [0, 0, bedBounds(bed).min[2] - bounds.min[2]]) : { ...mesh };
}

export function placeOnBed(mesh, bed) { return dropToBed(centerOnBed(mesh, bed), bed); }

// The picked world-space outward normal becomes the downward-facing bed normal.
// Bake the rotation into vertices and reset transforms while retaining XY center.
export function placeOnFace(mesh, worldNormal, bed) {
  const normal = vector(worldNormal, [0, 0, -1], 'Face normal');
  const length = Math.hypot(...normal);
  if (length < EPSILON) throw new Error('Face normal cannot be zero');
  const from = normal.map(value => value / length);
  const cosine = Math.max(-1, Math.min(1, -from[2]));
  let axis = [-from[1], from[0], 0], sine = Math.hypot(...axis);
  if (sine < EPSILON) { axis = [1, 0, 0]; sine = 0; }
  else axis = axis.map(value => value / sine);
  const original = meshBounds(mesh);
  if (!original) throw new Error('No surface to place on the bed');
  const transformed = transformPositions(mesh), rotated = new Float32Array(transformed.length);
  for (let i = 0; i < transformed.length; i += 3) {
    const v = [0, 1, 2].map(index => transformed[i + index] - original.center[index]);
    const cross = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
    const projection = axis.reduce((sum, value, index) => sum + value * v[index], 0);
    for (let index = 0; index < 3; index++) rotated[i + index] = original.center[index] + v[index] * cosine + cross[index] * sine + axis[index] * projection * (1 - cosine);
  }
  const bounds = boundsOf(rotated), target = bedBounds(bed);
  const delta = [original.center[0] - bounds.center[0], original.center[1] - bounds.center[1], target.min[2] - bounds.min[2]];
  for (let i = 0; i < rotated.length; i++) rotated[i] += delta[i % 3];
  if (vector(mesh.scale, [1, 1, 1], 'Scale').reduce((product, value) => product * value, 1) < 0) {
    for (let i = 0; i < rotated.length; i += 9) for (let axis = 0; axis < 3; axis++) [rotated[i + 3 + axis], rotated[i + 6 + axis]] = [rotated[i + 6 + axis], rotated[i + 3 + axis]];
  }
  return createMesh({ ...mesh, positions: rotated, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
}

// Translate an imported assembly as a whole so all part offsets are retained.
export function placeObjectsOnBed(objects, bed) {
  const bounds = sceneBounds(objects);
  if (!bounds) return objects.map(mesh => ({ ...mesh }));
  const target = bedBounds(bed);
  const delta = [target.center[0] - bounds.center[0], target.center[1] - bounds.center[1], target.min[2] - bounds.min[2]];
  return objects.map(mesh => mesh.visible === false ? { ...mesh } : translateMesh(mesh, delta));
}

export function duplicateObject(objects, id, { offset = [10, 10, 0], newId = meshId() } = {}) {
  const source = objects.find(mesh => mesh.id === id);
  if (!source) throw new Error(`Object not found: ${id}`);
  if (objects.some(mesh => mesh.id === newId)) throw new Error('Duplicate object ID');
  const duplicate = createMesh({ ...source, id: newId, name: `${source.name} copy` });
  return [...objects, translateMesh(duplicate, offset)];
}

export function removeObject(objects, id) { return objects.filter(mesh => mesh.id !== id); }

export function fitsOnBed(mesh, bed, tolerance = 1e-5) {
  const bounds = meshBounds(mesh), target = bedBounds(bed);
  return !bounds || bounds.min.every((value, axis) => value >= target.min[axis] - tolerance && bounds.max[axis] <= target.max[axis] + tolerance);
}

/** Deterministic shelf arrangement of transformed axis-aligned bounding boxes.
 * Preserves rotation/scale, keeps hidden objects untouched, and throws on failure.
 * It does not claim polygon nesting, native packing optimality, or keep-out handling.
 */
export function arrangeObjects(objects, bed, { gap = 5, margin = 5 } = {}) {
  if (![gap, margin].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Arrangement gap and margin must be nonnegative');
  const target = bedBounds(bed);
  const width = target.size[0] - margin * 2, depth = target.size[1] - margin * 2;
  if (width <= 0 || depth <= 0) throw new Error('Arrangement margin leaves no printable area');
  const items = visibleObjects(objects).map(mesh => ({ mesh, bounds: meshBounds(mesh) })).filter(item => item.bounds);
  items.sort((a, b) => b.bounds.size[1] - a.bounds.size[1] || b.bounds.size[0] - a.bounds.size[0]);
  const placements = new Map();
  let x = 0, y = 0, rowDepth = 0;
  for (const { mesh, bounds } of items) {
    const [w, d, h] = bounds.size;
    if (w > width + EPSILON || d > depth + EPSILON || h > target.size[2] + EPSILON) throw new Error(`${mesh.name} is too large for this build volume`);
    if (x > 0 && x + w > width + EPSILON) { x = 0; y += rowDepth + gap; rowDepth = 0; }
    if (y + d > depth + EPSILON) throw new Error('Objects do not fit with this arrangement gap and margin');
    placements.set(mesh.id, translateMesh(mesh, [target.min[0] + margin + x - bounds.min[0], target.min[1] + margin + y - bounds.min[1], target.min[2] - bounds.min[2]]));
    x += w + gap;
    rowDepth = Math.max(rowDepth, d);
  }
  return objects.map(mesh => placements.get(mesh.id) || { ...mesh });
}

export function analyzeMesh(mesh, { tolerance = 1e-5 } = {}) {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Analysis tolerance must be positive');
  const positions = transformPositions(mesh);
  const vertices = new Map(), edges = new Map(), triangleKeys = new Set(), adjacency = [];
  let degenerateTriangles = 0, duplicateTriangles = 0, surfaceArea = 0, signedVolume = 0;
  const vertexId = point => {
    const key = point.map(value => Math.round(value / tolerance)).join(',');
    if (!vertices.has(key)) vertices.set(key, vertices.size);
    return vertices.get(key);
  };
  for (let offset = 0; offset < positions.length; offset += 9) {
    const a = Array.from(positions.slice(offset, offset + 3)), b = Array.from(positions.slice(offset + 3, offset + 6)), c = Array.from(positions.slice(offset + 6, offset + 9));
    const ab = b.map((value, axis) => value - a[axis]), ac = c.map((value, axis) => value - a[axis]);
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const area = Math.hypot(...cross) / 2;
    const ids = [a, b, c].map(vertexId);
    if (new Set(ids).size < 3 || area <= tolerance * tolerance) { degenerateTriangles++; continue; }
    const triangleKey = [...ids].sort((first, second) => first - second).join(',');
    if (triangleKeys.has(triangleKey)) duplicateTriangles++;
    triangleKeys.add(triangleKey);
    surfaceArea += area;
    signedVolume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    const face = adjacency.length;
    adjacency.push(new Set());
    for (let index = 0; index < 3; index++) {
      const from = ids[index], to = ids[(index + 1) % 3], key = `${Math.min(from, to)},${Math.max(from, to)}`;
      const edge = edges.get(key) || { faces: [], orientation: 0 };
      for (const adjacent of edge.faces) { adjacency[face].add(adjacent); adjacency[adjacent].add(face); }
      edge.faces.push(face); edge.orientation += from < to ? 1 : -1; edges.set(key, edge);
    }
  }
  let boundaryEdges = 0, nonManifoldEdges = 0, inconsistentWindingEdges = 0, connectedComponents = 0;
  for (const edge of edges.values()) {
    if (edge.faces.length === 1) boundaryEdges++;
    if (edge.faces.length > 2) nonManifoldEdges++;
    if (edge.faces.length === 2 && edge.orientation !== 0) inconsistentWindingEdges++;
  }
  const visited = new Set();
  for (let face = 0; face < adjacency.length; face++) {
    if (visited.has(face)) continue;
    connectedComponents++; const pending = [face]; visited.add(face);
    while (pending.length) for (const adjacent of adjacency[pending.pop()]) if (!visited.has(adjacent)) { visited.add(adjacent); pending.push(adjacent); }
  }
  const watertight = positions.length > 0 && boundaryEdges === 0 && nonManifoldEdges === 0 && degenerateTriangles === 0;
  return { triangles: positions.length / 9, vertices: vertices.size, bounds: boundsOf(positions), surfaceArea, signedVolume, volume: Math.abs(signedVolume), boundaryEdges, nonManifoldEdges, inconsistentWindingEdges, degenerateTriangles, duplicateTriangles, connectedComponents, watertight, manifold: watertight && inconsistentWindingEdges === 0 && duplicateTriangles === 0,
    limitations: ['Self-intersections and vertex-only non-manifold connections are not detected. Volume is reliable only for consistently wound closed surfaces.'] };
}

export function exportSTL(objects) {
  const included = visibleObjects(objects);
  const count = triangleCount(included);
  if (!count) throw new Error('No visible triangles to export');
  if (count > 0xffffffff) throw new Error('Too many triangles for binary STL');
  const buffer = new ArrayBuffer(84 + count * 50), view = new DataView(buffer);
  const header = 'Orca Web transformed scene; millimetres';
  for (let index = 0; index < header.length; index++) view.setUint8(index, header.charCodeAt(index));
  view.setUint32(80, count, true);
  let offset = 84;
  for (const mesh of included) {
    const positions = transformPositions(mesh);
    const mirrored = vector(mesh.scale, [1, 1, 1], 'Scale').reduce((product, value) => product * value, 1) < 0;
    for (let triangle = 0; triangle < positions.length; triangle += 9) {
      const a = Array.from(positions.slice(triangle, triangle + 3));
      const b = Array.from(positions.slice(triangle + (mirrored ? 6 : 3), triangle + (mirrored ? 9 : 6)));
      const c = Array.from(positions.slice(triangle + (mirrored ? 3 : 6), triangle + (mirrored ? 6 : 9)));
      const ab = b.map((value, axis) => value - a[axis]), ac = c.map((value, axis) => value - a[axis]);
      const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const length = Math.hypot(...normal);
      for (const value of [...normal.map(value => length ? value / length : 0), ...a, ...b, ...c]) { view.setFloat32(offset, value, true); offset += 4; }
      view.setUint16(offset, 0, true); offset += 2;
    }
  }
  return buffer;
}
