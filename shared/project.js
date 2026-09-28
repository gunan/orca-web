import {normalizeInstanceAutoDrop} from './native-instances.js';
import {normalizePrusaSource} from './prusa-provenance.js';
import {normalizeAuxiliary,normalizeModelMetadata} from './native-auxiliary.js';
import {normalizeNativeAssets} from './native-assets.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';
import {normalizeNativeEmbossMetadata} from './native-emboss.js';
import {normalizeSelectionState} from './multi-selection.js';
import {normalizeFilamentSequence,decodePrintSequence} from './filament-sequence.js';
import {normalizePainting} from './facet-painting.js';
import { zipSync, strToU8 } from 'fflate';
import { transformPositions } from './geometry.js';

export const PROJECT_VERSION = 1;
export function emptyProject() {
  return { format: 'orca-web-project', version: PROJECT_VERSION, name: 'Untitled', objects: [], plates: [{ id: 'plate-1', name: 'Plate 1' }], activePlateId: 'plate-1', selectedId: null, selectedIds: [], selectionScope: 'object', selectionFrame: null, ids: { printerId: '', processId: '', filamentId: '' }, overrides: {}, metadata: { author: '', description: '' } };
}

export function validateProject(value) {
  if (!value || value.format !== 'orca-web-project' || value.version !== PROJECT_VERSION) throw new Error('Unsupported Orca Web project format or version.');
  if (!Array.isArray(value.objects) || !Array.isArray(value.plates) || !value.plates.length || value.plates.length > 100) throw new Error('Project needs a valid object list and 1–100 plates.');
  if (value.objects.length > 10000) throw new Error('Project has too many objects.');
  const plateIds = new Set(), objectIds = new Set();
  for (const plate of value.plates) {
    if (!plate || typeof plate.id !== 'string' || !plate.id || plateIds.has(plate.id) || typeof plate.name !== 'string') throw new Error('Project plate IDs must be unique and named.');
    if(plate.native?.filamentSequence)normalizeFilamentSequence(plate.native.filamentSequence);
    decodePrintSequence({...value.nativeSettings,...plate.native?.metadata});
    plateIds.add(plate.id);
  }
  if (!plateIds.has(value.activePlateId)) throw new Error('The active plate is missing.');
  let coordinates = 0;const paintBudget={nodes:0};
  for (const object of value.objects) {
    if (!object || typeof object.id !== 'string' || !object.id || objectIds.has(object.id) || typeof object.name !== 'string') throw new Error('Project object IDs must be unique and named.');
    objectIds.add(object.id);
    if (!plateIds.has(object.plateId)) throw new Error('An object references a missing plate.');
    if (!Array.isArray(object.positions) || !object.positions.length || object.positions.length % 9) throw new Error('Object geometry must contain complete triangles.');
    coordinates += object.positions.length;
    if (coordinates > 18000000) throw new Error('Project exceeds the two million triangle limit.');
    if (!object.positions.every(number => typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= 1e7)) throw new Error('Object geometry contains invalid coordinates.');
    for (const key of ['position', 'rotation', 'scale']) if (!Array.isArray(object[key]) || object[key].length !== 3 || !object[key].every(number => typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= 1e7)) throw new Error(`Object ${key} must contain three finite numbers.`);
    normalizeNativeEmbossMetadata(object.native);normalizeNativeMeshSource(object);normalizeInstanceAutoDrop(object.native?.instanceAutoDrop);
    normalizePainting(object.painting,object.positions.length/9,{budget:paintBudget});
    if (object.scale.some(number => number <= 0 || number > 10000)) throw new Error('Object scale must be positive and no greater than 10000.');
  }
  if (!value.ids || !['printerId', 'processId', 'filamentId'].every(key => typeof value.ids[key] === 'string')) throw new Error('Project preset selection is invalid.');
  if (!value.overrides || typeof value.overrides !== 'object' || Array.isArray(value.overrides)) throw new Error('Project settings are invalid.');
  normalizeNativeAssets(value.nativeAssets);
  normalizePrusaSource(value.nativeLegacySource);
  normalizeAuxiliary(value.nativeAuxiliary);
  normalizeModelMetadata(value.nativeModelMetadata);
  normalizeSelectionState(value);
  return value;
}

export function serializeProject(project) {
  const result = { ...normalizeSelectionState(project), objects: project.objects.map(object => ({ ...object, positions: Array.from(object.positions) })) };
  validateProject(result);
  return JSON.stringify(result);
}

export function parseProject(text) {
  if (typeof text !== 'string' || text.length > 150 * 1024 * 1024) throw new Error('Project file exceeds the 150 MB limit.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Project file is not valid JSON.'); }
  validateProject(value);
  return { ...emptyProject(), ...normalizeSelectionState(value), metadata: { author: String(value.metadata?.author || ''), description: String(value.metadata?.description || '') }, name: String(value.name || 'Untitled') };
}

const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

// Core 3MF model export. Native-specific process/plate metadata is deliberately
// not invented. The separate JSON part preserves the richer Orca Web document.
export function export3MF(project, { allPlates = false } = {}) {
  const objects = project.objects.filter(object => object.visible !== false && (allPlates || object.plateId === project.activePlateId));
  if (!objects.length) throw new Error('The selected plate has no visible objects to export.');
  const resources = objects.map((object, index) => {
    const points = transformPositions(object), vertices = [], triangles = [], keys = new Map();
    for (let offset = 0; offset < points.length; offset += 9) {
      const ids = [];
      for (let vertex = 0; vertex < 3; vertex++) {
        const point = Array.from(points.slice(offset + vertex * 3, offset + vertex * 3 + 3));
        const key = point.map(value => value.toFixed(7)).join(',');
        if (!keys.has(key)) { keys.set(key, vertices.length); vertices.push(point); }
        ids.push(keys.get(key));
      }
      triangles.push(ids);
    }
    return `<object id="${index + 1}" type="model" name="${xml(object.name)}"><mesh><vertices>${vertices.map(point => `<vertex x="${point[0]}" y="${point[1]}" z="${point[2]}"/>`).join('')}</vertices><triangles>${triangles.map(ids => `<triangle v1="${ids[0]}" v2="${ids[1]}" v3="${ids[2]}"/>`).join('')}</triangles></mesh></object>`;
  }).join('');
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${xml(project.name)}</metadata><metadata name="Designer">${xml(project.metadata?.author || '')}</metadata><metadata name="Description">${xml(project.metadata?.description || '')}</metadata><resources>${resources}</resources><build>${objects.map((_, index) => `<item objectid="${index + 1}"/>`).join('')}</build></model>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="json" ContentType="application/json"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': strToU8(model),
    'Metadata/orca-web.json': strToU8(serializeProject(project))
  }, { level: 6 });
}
