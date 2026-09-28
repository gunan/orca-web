import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { strFromU8 } from 'fflate';
import { createMesh, placeObjectsOnBed } from '../shared/geometry.js';
import { importLimits, assertFileSize, assertTriangleCount, extractBoundedZip } from '../shared/import-limits.js';
import { importAMF, importSVG, importSTEP, xmlDocument } from './importers.js';

const UNIT_MM = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
const extensionOf = name => String(name).split('.').pop().toLowerCase();

function threeMFUnits(files, limits) {
  // ThreeMFLoader currently reads the model unit without applying its scale.
  const units = new Set();
  let triangles = 0;
  for (const [name, file] of Object.entries(files)) {
    if (!/\.model$/i.test(name)) continue;
    const document = xmlDocument(strFromU8(file), 'model');
    const model = document.querySelector('model');
    if (model) units.add(model.getAttribute('unit') || 'millimeter');
    triangles += document.querySelectorAll('triangle').length;
    assertTriangleCount(triangles, limits);
  }
  if (!units.size) throw new Error('3MF contains no model geometry');
  if (units.size !== 1) throw new Error('3MF models with mixed length units are not supported');
  const unit = [...units][0];
  if (!(unit in UNIT_MM)) throw new Error(`Unsupported 3MF unit: ${unit}`);
  return UNIT_MM[unit];
}

function geometryPositions(geometry, matrix, limits) {
  assertTriangleCount((geometry.index?.count || geometry.getAttribute('position')?.count || 0) / 3, limits);
  const transformed = geometry.clone();
  if (matrix) transformed.applyMatrix4(matrix);
  const triangles = transformed.index ? transformed.toNonIndexed() : transformed;
  const attribute = triangles.getAttribute('position');
  const positions = attribute ? Array.from(attribute.array) : [];
  // A negative component transform reverses winding; retain outward surfaces.
  if (matrix?.determinant() < 0) for (let i = 0; i < positions.length; i += 9) for (let axis = 0; axis < 3; axis++) [positions[i + 3 + axis], positions[i + 6 + axis]] = [positions[i + 6 + axis], positions[i + 3 + axis]];
  if (triangles !== transformed) triangles.dispose();
  transformed.dispose();
  return positions;
}

function disposeTree(root) {
  root.traverse(object => {
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

/** Parse file bytes into independent editable surface meshes. OBJ groups and
 * 3MF mesh/build-item transforms survive as separate objects and sourceGroup
 * metadata. Embedded 3MF slicing profiles/support painting are not imported.
 * STL and OBJ coordinates are treated as millimetres; 3MF units are converted.
 */
export async function parseModel(data, filename, options = {}) {
  const { bed, place = true } = options;
  const limits = importLimits(options.limits);
  const format = extensionOf(filename);
  if (!['stl', 'obj', '3mf', 'amf', 'svg', 'step', 'stp'].includes(format)) throw new Error('Choose an STL, OBJ, 3MF, AMF, SVG, or STEP model');
  if (typeof data === 'string') assertFileSize(new TextEncoder().encode(data).byteLength, limits);
  else assertFileSize(data?.byteLength, limits);
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  if (!buffer.byteLength) throw new Error('Model file is empty');
  const basename = String(filename).replace(/\.[^.]+$/, '');
  const objects = [];
  if (format === 'step' || format === 'stp') objects.push(...await importSTEP(buffer, filename, options));
  else if (format === 'stl') {
    if (buffer.byteLength < 84) throw new Error('STL model is incomplete or contains no triangles');
    const count = new DataView(buffer).getUint32(80, true), asciiHeader = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(80, buffer.byteLength))).trimStart().startsWith('solid');
    if (!asciiHeader || 84 + count * 50 === buffer.byteLength) {
      assertTriangleCount(count, limits);
      if (84 + count * 50 > buffer.byteLength) throw new Error('Binary STL is truncated');
    } else {
      let facets = 0;
      for (const _ of new TextDecoder().decode(buffer).matchAll(/\bfacet\s+normal\b/g)) assertTriangleCount(++facets, limits);
    }
    const geometry = new STLLoader().parse(buffer);
    try { objects.push(createMesh({ name: basename, positions: geometryPositions(geometry, null, limits), sourceFormat: format, sourceFile: filename, sourceGroup: basename })); }
    finally { geometry.dispose(); }
  } else {
    let root, unit = 1;
    if (format === 'obj') {
      const text = new TextDecoder().decode(buffer);
      let triangles = 0;
      for (const face of text.matchAll(/^\s*f\s+([^\r\n]+)/gm)) { triangles += Math.max(0, face[1].trim().split(/\s+/).length - 2); assertTriangleCount(triangles, limits); }
      root = new OBJLoader().parse(text);
    } else if (format === 'amf') root = importAMF(buffer, options);
    else if (format === 'svg') root = importSVG(buffer, options);
    else {
      unit = threeMFUnits(extractBoundedZip(buffer, options.limits), limits);
      root = new ThreeMFLoader().parse(buffer);
    }
    if (!root) throw new Error(`Could not parse ${format.toUpperCase()} model`);
    try {
      if (format === '3mf') root.scale.multiplyScalar(unit);
      root.updateMatrixWorld(true);
      let count = 0, triangles = 0;
      root.traverse(object => {
        if (!object.isMesh || !object.geometry?.getAttribute('position')) return;
        const names = [];
        for (let ancestor = object; ancestor && ancestor !== root; ancestor = ancestor.parent) if (ancestor.name) names.unshift(ancestor.name);
        const name = object.name || names.at(-1) || `${basename} ${++count}`;
        triangles += (object.geometry.index?.count || object.geometry.getAttribute('position').count) / 3;
        assertTriangleCount(triangles, limits);
        const positions = geometryPositions(object.geometry, object.matrixWorld, limits);
        if (!positions.length) return;
        objects.push(createMesh({ name, positions, sourceFormat: format, sourceFile: filename, sourceGroup: names.join('/') || basename,
          ...(root.userData.importWarnings?.length ? { importWarnings: root.userData.importWarnings } : {}),
          ...(format === '3mf' ? { importWarnings: ['3MF geometry and build transforms imported. Embedded process/printer settings, painting, and plate assignments are not restored.'] } : {}) }));
      });
    } finally { disposeTree(root); }
  }
  if (!objects.length || objects.every(object => !object.positions.length)) throw new Error('The model contains no triangles');
  assertTriangleCount(objects.reduce((sum, object) => sum + object.positions.length / 9, 0), limits);
  return place ? placeObjectsOnBed(objects, bed) : objects;
}

/** Returns Promise<Mesh[]>; import positioning preserves assembly offsets. */
export async function loadModelFile(file, options = {}) {
  if (!file?.name || typeof file.arrayBuffer !== 'function') throw new Error('A model file is required');
  if (typeof file.size === 'number') assertFileSize(file.size, importLimits(options.limits));
  return parseModel(await file.arrayBuffer(), file.name, options);
}
