import { ExtrudeGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { AMFLoader } from 'three/addons/loaders/AMFLoader.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { strFromU8 } from 'fflate';
import { createMesh } from '../shared/geometry.js';
import { assertTriangleCount, importLimits, extractBoundedZip } from '../shared/import-limits.js';

const numberOption = (value, fallback, min, max, label) => {
  const number = value ?? fallback;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return number;
};

export function xmlDocument(text, rootName) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML document types and entities are not supported');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.localName.toLowerCase() !== rootName) throw new Error(`Invalid ${rootName.toUpperCase()} XML`);
  return document;
}

export function importAMF(buffer, options = {}) {
  const bytes = new Uint8Array(buffer), zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
  let data = bytes;
  if (zipped) {
    const entries = Object.entries(extractBoundedZip(bytes, options.limits)).filter(([name]) => /\.amf$/i.test(name));
    if (entries.length !== 1) throw new Error('Compressed AMF must contain exactly one AMF document');
    data = entries[0][1];
  }
  const document = xmlDocument(strFromU8(data), 'amf');
  const unit = (document.documentElement.getAttribute('unit') || 'millimeter').toLowerCase();
  if (!['millimeter', 'inch', 'feet', 'meter', 'micron'].includes(unit)) throw new Error(`Unsupported AMF unit: ${unit}`);
  if (document.querySelector('constellation')) throw new Error('AMF constellation transforms are not supported; export explicit mesh objects instead');
  const triangles = document.querySelectorAll('triangle').length;
  assertTriangleCount(triangles, importLimits(options.limits));
  const root = new AMFLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  if (!root) throw new Error('AMF contains no usable model');
  root.userData.importWarnings = ['AMF mesh volumes and length units imported. Material assignments are not converted to printer filaments.'];
  return root;
}

function lengthMM(value, dpi) {
  if (value == null || value === '') return null;
  const match = String(value).trim().match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/i);
  if (!match) throw new Error('SVG viewport dimensions must use explicit lengths, not percentages');
  const amount = Number(match[1]), factors = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / dpi };
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('SVG viewport dimensions must be positive');
  return amount * factors[(match[2] || 'px').toLowerCase()];
}

export function svgDimensions(attributes = {}, options = {}) {
  const dpi = numberOption(options.svgDPI, 96, 1, 2400, 'SVG DPI');
  const scale = numberOption(options.svgScale, 1, 0.0001, 10000, 'SVG scale');
  const depth = numberOption(options.svgDepth, 10, 0.01, 10000, 'SVG extrusion depth');
  const width = lengthMM(attributes.width, dpi), height = lengthMM(attributes.height, dpi);
  const viewBox = attributes.viewBox ? String(attributes.viewBox).trim().split(/[\s,]+/).map(Number) : null;
  if (viewBox && (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0)) throw new Error('SVG viewBox must have four finite values and positive dimensions');
  let scaleX = 25.4 / dpi, scaleY = scaleX, offsetX = 0, offsetY = 0;
  if (viewBox) {
    const [x, y, w, h] = viewBox;
    const viewportWidth = width ?? (height == null ? w * scaleX : height * w / h), viewportHeight = height ?? (width == null ? h * scaleY : width * h / w);
    scaleX = viewportWidth / w; scaleY = viewportHeight / h;
    const aspect = attributes.preserveAspectRatio || 'xMidYMid meet';
    if (!/^none(?:\s|$)/.test(aspect)) {
      const uniform = /\bslice\b/.test(aspect) ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
      scaleX = scaleY = uniform;
      offsetX = (viewportWidth - w * uniform) * (/xMin/.test(aspect) ? 0 : /xMax/.test(aspect) ? 1 : 0.5);
      offsetY = (viewportHeight - h * uniform) * (/YMin/.test(aspect) ? 0 : /YMax/.test(aspect) ? 1 : 0.5);
    }
    offsetX -= x * scaleX; offsetY -= y * scaleY;
  }
  return { scaleX: scaleX * scale, scaleY: scaleY * scale, offsetX: offsetX * scale, offsetY: offsetY * scale, depth, dpi, warnings: !width && !height ? [`SVG has no physical viewport size; one pixel is ${25.4 / dpi} mm at ${dpi} DPI.`] : [] };
}

export function importSVG(buffer, options = {}) {
  const text = strFromU8(new Uint8Array(buffer)), document = xmlDocument(text, 'svg');
  const svg = document.documentElement;
  if (document.querySelector('script,foreignObject,image,text')) throw new Error('SVG import supports vector paths; convert text and embedded images to paths first');
  const attributes = Object.fromEntries(['width', 'height', 'viewBox', 'preserveAspectRatio'].map(name => [name, svg.getAttribute(name)]));
  const dimensions = svgDimensions(attributes, options);
  const segments = numberOption(options.svgCurveSegments, 12, 1, 64, 'SVG curve segments');
  if (!Number.isInteger(segments)) throw new Error('SVG curve segments must be an integer');
  const loader = new SVGLoader(); loader.defaultDPI = dimensions.dpi; loader.defaultUnit = 'px';
  const parsed = loader.parse(text), root = new Group(), warnings = [...dimensions.warnings];
  let triangleCount = 0, skippedStrokes = false;
  const limits = importLimits(options.limits);
  for (const path of parsed.paths) {
    const style = path.userData?.style || {};
    if (style.fill === 'none' || style.fillOpacity === 0 || style.opacity === 0 || style.visibility === 'hidden' || style.display === 'none') { if (style.stroke && style.stroke !== 'none') skippedStrokes = true; continue; }
    for (const [index, shape] of SVGLoader.createShapes(path).entries()) {
      const geometry = new ExtrudeGeometry(shape, { depth: dimensions.depth, steps: 1, bevelEnabled: false, curveSegments: segments });
      triangleCount += (geometry.index?.count || geometry.getAttribute('position').count) / 3;
      try { assertTriangleCount(triangleCount, limits); }
      catch (error) { geometry.dispose(); root.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); }); throw error; }
      const mesh = new Mesh(geometry, new MeshBasicMaterial());
      mesh.name = path.userData?.node?.id || `SVG shape ${root.children.length + 1}`;
      if (index) mesh.name += ` ${index + 1}`;
      mesh.scale.set(dimensions.scaleX, -dimensions.scaleY, 1);
      mesh.position.set(dimensions.offsetX, -dimensions.offsetY, 0);
      root.add(mesh);
    }
  }
  if (skippedStrokes) warnings.push('Stroke-only paths were omitted; convert strokes to filled outlines before import.');
  warnings.push(`Filled SVG paths extruded ${dimensions.depth} mm. Curves are tessellated; colours are not filament assignments.`);
  root.userData.importWarnings = warnings;
  return root;
}

export function stepParameters(options = {}) {
  return { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: numberOption(options.stepLinearDeflection, 0.1, 0.001, 10, 'STEP linear deflection'), angularDeflection: numberOption(options.stepAngularDeflection, 0.5, 0.01, Math.PI, 'STEP angular deflection') };
}

export function stepMeshes(result, filename, options = {}) {
  if (!result?.success || !Array.isArray(result.meshes)) throw new Error('OpenCascade could not tessellate this STEP file');
  const limits = importLimits(options.limits), groups = new Map();
  function visit(node, parent = '') {
    if (!node) return;
    const current = [parent, node.name].filter(Boolean).join('/');
    for (const index of node.meshes || []) if (!groups.has(index)) groups.set(index, current);
    for (const child of node.children || []) visit(child, current);
  }
  visit(result.root);
  let triangles = 0;
  return result.meshes.map((mesh, meshIndex) => {
    const vertices = mesh.attributes?.position?.array, indices = mesh.index?.array;
    if (!vertices || !indices || indices.length % 3 || vertices.length % 3) throw new Error('STEP tessellator returned invalid mesh data');
    triangles += indices.length / 3; assertTriangleCount(triangles, limits);
    const positions = new Array(indices.length * 3);
    for (let index = 0; index < indices.length; index++) {
      const vertex = indices[index];
      if (!Number.isInteger(vertex) || vertex < 0 || vertex * 3 + 2 >= vertices.length) throw new Error('STEP tessellator returned an invalid vertex index');
      for (let axis = 0; axis < 3; axis++) positions[index * 3 + axis] = vertices[vertex * 3 + axis];
    }
    return createMesh({ name: mesh.name || `STEP part ${meshIndex + 1}`, positions, sourceFormat: 'step', sourceFile: filename, sourceGroup: groups.get(meshIndex) || '', sourceColor: mesh.color || null,
      importWarnings: [`STEP surfaces tessellated with ${stepParameters(options).linearDeflection} mm linear deflection. Parametric features and CAD editing history are not retained.`] });
  });
}

export async function importSTEP(buffer, filename, options = {}) {
  const params = stepParameters(options);
  if (options.stepEngine) return stepMeshes(options.stepEngine.ReadStepFile(new Uint8Array(buffer), params), filename, options);
  if (typeof Worker === 'undefined') throw new Error('STEP import requires a browser worker or a supplied OpenCascade engine');
  const timeout = numberOption(options.stepTimeoutMs, 60000, 100, 120000, 'STEP import timeout');
  const worker = new Worker(new URL('./step-worker.js', import.meta.url), { type: 'module' });
  const result = await new Promise((resolve, reject) => {
    const finish = (error, result) => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); worker.terminate(); error ? reject(error) : resolve(result); };
    const abort = () => finish(new Error('STEP import cancelled'));
    const timer = setTimeout(() => finish(new Error('STEP tessellation exceeded its time limit')), timeout);
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => event.data.error ? finish(new Error(event.data.error)) : finish(null, event.data.result);
    worker.onerror = event => finish(new Error(event.message || 'STEP worker failed'));
    const content = buffer.slice(0);
    worker.postMessage({ buffer: content, params, maxTriangles: importLimits(options.limits).maxTriangles }, [content]);
  });
  return stepMeshes(result, filename, options);
}
