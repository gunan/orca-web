import {invalidateNativeEmboss} from './native-emboss.js';
import {remapFacetPainting,mergeFacetPainting,assertRemovableFacets} from './facet-correspondence.js';
import { createMesh, transformPositions, analyzeMesh } from './geometry.js';

function bakedPositions(mesh) {
  const positions = Array.from(transformPositions(mesh));
  if ((mesh.scale || [1,1,1]).reduce((product, value) => product * value, 1) < 0) {
    for (let offset = 0; offset < positions.length; offset += 9) for (let axis = 0; axis < 3; axis++) [positions[offset + 3 + axis], positions[offset + 6 + axis]] = [positions[offset + 6 + axis], positions[offset + 3 + axis]];
  }
  return positions;
}
function toleranceValue(value) {
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error('Geometry tolerance must be positive and at most 1 mm');
  return value;
}
function topology(positions, tolerance) {
  const keys = new Map(), vertices = [], faces = [], edges = new Map();
  let snappedVertices = 0;
  for (let offset = 0; offset < positions.length; offset += 9) {
    const ids = [];
    for (let vertex = 0; vertex < 3; vertex++) {
      const point = positions.slice(offset + vertex * 3, offset + vertex * 3 + 3), key = point.map(value => Math.round(value / tolerance)).join(',');
      if (!keys.has(key)) { keys.set(key, vertices.length); vertices.push(point); }
      const id = keys.get(key);
      if (point.some((value, axis) => value !== vertices[id][axis])) snappedVertices++;
      ids.push(id);
    }
    faces.push(ids);
  }
  faces.forEach((face, faceIndex) => {
    for (let index = 0; index < 3; index++) {
      const from = face[index], to = face[(index + 1) % 3], key = `${Math.min(from, to)},${Math.max(from, to)}`;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push({ face: faceIndex, sign: from < to ? 1 : -1 });
    }
  });
  return { vertices, faces, edges, snappedVertices };
}
function componentsFor(faceCount, edges) {
  const adjacent = Array.from({ length: faceCount }, () => new Set());
  for (const incidents of edges.values()) for (let index = 1; index < incidents.length; index++) {
    adjacent[incidents[0].face].add(incidents[index].face); adjacent[incidents[index].face].add(incidents[0].face);
  }
  const visited = new Set(), components = [];
  for (let face = 0; face < faceCount; face++) {
    if (visited.has(face)) continue;
    const component = [], pending = [face]; visited.add(face);
    while (pending.length) {
      const current = pending.pop(); component.push(current);
      for (const neighbor of adjacent[current]) if (!visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); }
    }
    components.push(component.sort((a,b) => a - b));
  }
  return components;
}
function resetMesh(mesh, positions, overrides = {}) {
  const { assemblyParts: _parts, text: _text, brimEars: _brimEars, painting: _painting, ...metadata } = mesh;
  if (metadata.native) { metadata.native = invalidateNativeEmboss(metadata.native); delete metadata.native.groupTransform; }
  return createMesh({ ...metadata, positions, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], ...overrides });
}

/** Splits edge-connected shells; surfaces touching only at a vertex stay separate. */
export function splitDisconnected(mesh, { tolerance = 1e-5 } = {}) {
  const positions = bakedPositions(mesh), data = topology(positions, toleranceValue(tolerance));
  return componentsFor(data.faces.length, data.edges).map((faces, index) => resetMesh(mesh, faces.flatMap(face => positions.slice(face * 9, face * 9 + 9)), { id: undefined, name: `${mesh.name} part ${index + 1}`, splitFrom: mesh.id, painting: remapFacetPainting(mesh,faces) }));
}

/** Concatenates visible surfaces at their world positions. This is an assembly,
 * not a Boolean union; overlapping shells are intentionally not merged. */
export function assembleMeshes(meshes, { id, name = 'Assembly' } = {}) {
  const included = meshes.filter(mesh => mesh.visible !== false);
  if (!included.length) throw new Error('Select visible objects to assemble');
  const plateIds = new Set(included.map(mesh => mesh.plateId).filter(Boolean));
  if (plateIds.size > 1) throw new Error('Assembly objects must belong to the same plate');
  const positions = [], assemblyParts = [];
  for (const mesh of included) {
    const part = bakedPositions(mesh);
    if (!part.length) continue;
    assemblyParts.push({ id: mesh.id, name: mesh.name, startTriangle: positions.length / 9, triangleCount: part.length / 9, sourceGroup: mesh.sourceGroup || '' });
    for (const coordinate of part) positions.push(coordinate);
  }
  if (!positions.length) throw new Error('No triangles to assemble');
  return createMesh({ id, name, positions, plateId: included[0].plateId, painting: mergeFacetPainting(included), assemblyParts, sourceFormat: 'assembly', importWarnings: ['Assembly combines mesh surfaces without a Boolean union. Overlapping shells remain separate.'] });
}

export function disassembleMesh(mesh) {
  if (!Array.isArray(mesh.assemblyParts) || !mesh.assemblyParts.length) throw new Error('This object has no saved assembly parts');
  const positions = bakedPositions(mesh), used = new Set();
  const parts = mesh.assemblyParts.map(part => {
    if (!Number.isInteger(part.startTriangle) || !Number.isInteger(part.triangleCount) || part.startTriangle < 0 || part.triangleCount <= 0 || (part.startTriangle + part.triangleCount) * 9 > positions.length) throw new Error('Invalid assembly part range');
    for (let triangle = part.startTriangle; triangle < part.startTriangle + part.triangleCount; triangle++) { if (used.has(triangle)) throw new Error('Assembly part ranges overlap'); used.add(triangle); }
    return resetMesh(mesh, positions.slice(part.startTriangle * 9, (part.startTriangle + part.triangleCount) * 9), { id: undefined, name: part.name || 'Part', sourceGroup: part.sourceGroup || '', splitFrom: mesh.id, painting: remapFacetPainting(mesh,Array.from({length:part.triangleCount},(_,index)=>part.startTriangle+index)) });
  });
  if (used.size * 9 !== positions.length) throw new Error('Assembly metadata does not cover every triangle');
  return parts;
}

const faceVolume = (face, vertices) => {
  const [a,b,c] = face.map(id => vertices[id]);
  return (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
};

/** Conservative surface repair. Does not fill holes, perform a Boolean union,
 * repair self-intersections, or guess an orientation for nested closed shells. */
export function repairMesh(mesh, { tolerance = 1e-5, orientFaces = true, orientOutward = true } = {}) {
  toleranceValue(tolerance);
  const original = topology(bakedPositions(mesh), tolerance);
  const kept = [], keptIndices = [], removedIndices = [], seen = new Set();
  let removedDegenerateTriangles = 0, removedDuplicateTriangles = 0, flippedTriangles = 0, orientationConflicts = 0;
  for (const [sourceIndex,face] of original.faces.entries()) {
    const [a,b,c] = face.map(id => original.vertices[id]);
    const ab = b.map((value, axis) => value - a[axis]), ac = c.map((value, axis) => value - a[axis]);
    const area = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) / 2;
    if (new Set(face).size !== 3 || area <= tolerance * tolerance) { removedDegenerateTriangles++; removedIndices.push(sourceIndex); continue; }
    const key = [...face].sort((a,b) => a - b).join(',');
    if (seen.has(key)) { removedDuplicateTriangles++; removedIndices.push(sourceIndex); continue; }
    seen.add(key); kept.push(face.flatMap(id => original.vertices[id]));keptIndices.push(sourceIndex);
  }
  if (!kept.length) throw new Error('Repair would leave no valid triangles');
  assertRemovableFacets(mesh,removedIndices);const reversed=keptIndices.map(()=>false);
  const data = topology(kept.flat(), tolerance), components = componentsFor(data.faces.length, data.edges);
  if (orientFaces) {
    const adjacency = Array.from({ length: data.faces.length }, () => []);
    for (const incidents of data.edges.values()) if (incidents.length === 2) {
      const [first, second] = incidents, invert = first.sign === second.sign;
      adjacency[first.face].push([second.face, invert]); adjacency[second.face].push([first.face, invert]);
    }
    const flips = new Map();
    for (let start = 0; start < data.faces.length; start++) {
      if (flips.has(start)) continue;
      const current = [], pending = [start]; flips.set(start, false);
      while (pending.length) {
        const face = pending.pop(); current.push(face);
        for (const [neighbor, invert] of adjacency[face]) {
          const expected = flips.get(face) !== invert;
          if (!flips.has(neighbor)) { flips.set(neighbor, expected); pending.push(neighbor); }
          else if (flips.get(neighbor) !== expected) orientationConflicts++;
        }
      }
      // Choose the orientation requiring the fewest changes, preserving cavities.
      if (current.filter(face => flips.get(face)).length > current.length / 2) for (const face of current) flips.set(face, !flips.get(face));
    }
    for (const [face, flip] of flips) if (flip) { [data.faces[face][1], data.faces[face][2]] = [data.faces[face][2], data.faces[face][1]]; flippedTriangles++;reversed[face]=!reversed[face]; }
  }
  const closedSingleShell = components.length === 1 && [...data.edges.values()].every(incidents => incidents.length === 2);
  if (orientOutward && closedSingleShell && !orientationConflicts && data.faces.reduce((sum, face) => sum + faceVolume(face, data.vertices), 0) < 0) {
    for (const [index,face] of data.faces.entries()){[face[1], face[2]] = [face[2], face[1]];reversed[index]=!reversed[index];}
    flippedTriangles = data.faces.length - flippedTriangles;
  }
  const painting=remapFacetPainting(mesh,keptIndices,{reversed});
  const repaired = resetMesh(mesh, data.faces.flatMap(face => face.flatMap(id => data.vertices[id])),{painting});
  const remaining = analyzeMesh(repaired, { tolerance });
  const warnings = [];
  if (remaining.boundaryEdges) warnings.push(`${remaining.boundaryEdges} open boundary edges remain; holes were not filled.`);
  if (remaining.nonManifoldEdges || orientationConflicts) warnings.push('Non-manifold or conflicting surface connections remain.');
  if (components.length > 1) warnings.push('Multiple shells retained; outward orientation was not guessed for nested shells.');
  warnings.push('Self-intersections were not tested or repaired.');
  return { mesh: repaired, report: { paintingPreserved:Boolean(painting), removedDegenerateTriangles, removedDuplicateTriangles, snappedVertices: original.snappedVertices, flippedTriangles, orientationConflicts, remaining, warnings } };
}
