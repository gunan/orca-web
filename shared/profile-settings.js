import {PURGE_LIMITS} from './purge-volumes.js';
import schema from './native-profile-schema.json' with { type: 'json' };
import projectSchema from './native-project-schema.json' with { type: 'json' };
import { settingDefinitions, editableSettingDefinitions, normalizeOverrides } from './native-settings.js';

export const nativeProfileSchema = schema;
const vectorTypes = { coFloats: 'coFloat', coInts: 'coInt', coStrings: 'coString', coBools: 'coBool', coPercents: 'coPercent', coEnums: 'coEnum' };
const scalarTypes = { coFloat: 'number', coInt: 'number', coPercent: 'number', coBool: 'boolean', coEnum: 'enum', coFloatOrPercent: 'floatOrPercent', coString: 'string', coPoint: 'point', coPoints: 'points', coPointsGroups: 'pointGroups' };
const excluded = new Set(['inherits', 'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition', 'bbl_use_printhost']);
function definition(option) {
  return { ...option, type: scalarTypes[option.nativeType] || (vectorTypes[option.nativeType] ? 'vector' : undefined), elementType: vectorTypes[option.nativeType] ? scalarTypes[vectorTypes[option.nativeType]] : undefined, integer: ['coInt', 'coInts'].includes(option.nativeType), ...(option.options ? { options: option.options.map(item => item.value), optionLabels: Object.fromEntries(option.options.map(item => [item.value, item.label])) } : {}) };
}
export const projectSettingDefinitions = projectSchema.options.map(definition);
export function normalizeNativeProjectValues(values) {
  if (!values || Array.isArray(values) || typeof values !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(values))) throw new Error('Project settings must be an object');
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    const option = projectSettingDefinitions.find(item => item.key === key);
    if (!option || option.unresolved.length) throw new Error(`Unsupported native project setting: ${key}`);
    result[key] = normalizedValue(option, value);
  }
  return result;
}
export const definitionsByScope = { process: settingDefinitions, machine: schema.machine.options.map(definition), filament: schema.filament.options.map(definition) };
export const editableDefinitionsByScope = { process: editableSettingDefinitions, ...Object.fromEntries(['machine', 'filament'].map(scope => [scope, definitionsByScope[scope].filter(option => option.ui && !option.readOnly && !option.unresolved.length && !excluded.has(option.key)).sort((left, right) => left.ui.order - right.ui.order)])) };
export const groupsByScope = Object.fromEntries(Object.entries(editableDefinitionsByScope).map(([scope, options]) => [scope, Object.fromEntries([...new Set(options.map(option => option.ui.page))].map(page => [page, options.filter(option => option.ui.page === page)]))]));
const indexes = Object.fromEntries(Object.entries(editableDefinitionsByScope).map(([scope, options]) => [scope, new Map(options.map(option => [option.key, option]))]));
const nativeIndexes = Object.fromEntries(Object.entries(definitionsByScope).map(([scope, options]) => [scope, new Map(options.map(option => [option.key, option]))]));
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const maxBytes = 64 * 1024;
const bytes = value => new TextEncoder().encode(value).byteLength;

function scalar(option, value, nativeType = option.nativeType) {
  const label = option.fullLabel || option.label || option.key;
  if (value === null || value === 'nil') {
    if (option.nullable) return 'nil';
    throw new Error(`${label} does not allow an inherited/null value`);
  }
  if (nativeType === 'coBool') {
    if (![true, false, '0', '1'].includes(value)) throw new Error(`${label} must be a boolean`);
    return value === true || value === '1' ? '1' : '0';
  }
  if (nativeType === 'coEnum') {
    if (!option.options?.includes(value)) throw new Error(`Invalid ${label}: ${String(value)}`);
    return value;
  }
  if (nativeType === 'coString') {
    if (typeof value !== 'string') throw new Error(`${label} must be a string`);
    if (bytes(value) > maxBytes || value.includes('\0')) throw new Error(`${label} must be at most 64 KB and cannot contain null characters`);
    return value;
  }
  if (!['coFloat', 'coInt', 'coPercent', 'coFloatOrPercent'].includes(nativeType)) throw new Error(`Unsupported native setting type: ${nativeType}`);
  if (!['number', 'string'].includes(typeof value)) throw new Error(`${label} must be a number`);
  let text = String(value).trim(); const percent = text.endsWith('%');
  if (percent && !['coPercent', 'coFloatOrPercent'].includes(nativeType)) throw new Error(`${label} does not accept percentages`);
  if (percent) text = text.slice(0, -1).trim();
  const numeric = Number(text);
  const minimum = nativeType === 'coInt' ? Math.max(option.min, -2147483648) : option.min;
  const maximum = nativeType === 'coInt' ? Math.min(option.max, option.nullable ? 2147483646 : 2147483647) : option.max;
  if (!decimal.test(text) || !Number.isFinite(numeric) || numeric < minimum || numeric > maximum || (nativeType === 'coInt' && !Number.isInteger(numeric))) throw new Error(`${label} must be ${nativeType === 'coInt' ? 'an integer' : 'a number'} between ${minimum} and ${maximum}`);
  if (option.minimumExclusive !== undefined && numeric <= option.minimumExclusive) throw new Error(`${label} must be greater than ${option.minimumExclusive}`);
  return `${numeric}${nativeType === 'coPercent' || percent ? '%' : ''}`;
}
function point(option, value, delimiter) {
  const coordinates = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[x,]/) : [];
  if (coordinates.length !== 2) throw new Error(`${option.label} needs exactly two coordinates per point`);
  return coordinates.map(coordinate => scalar(option, coordinate, 'coFloat')).join(delimiter);
}
function normalizedValue(option, value) {
  const elementType = vectorTypes[option.nativeType];
  if (elementType || ['coPoints', 'coPointsGroups'].includes(option.nativeType)) {
    if (!Array.isArray(value)) throw new Error(`${option.fullLabel || option.label} must be an array`);
    const entryLimit=option.key==='flush_volumes_matrix'?PURGE_LIMITS.cells:1024;
    if (value.length > entryLimit) throw new Error(`${option.label} cannot contain more than ${entryLimit} entries`);
    let output;
    if (elementType) output = value.map(item => scalar(option, item, elementType));
    else if (option.nativeType === 'coPoints') output = value.map(item => point(option, item, 'x'));
    else output = value.map(group => {
      const points = typeof group === 'string' ? (group.trim() ? group.split(',') : []) : group;
      if (!Array.isArray(points)) throw new Error(`${option.label} requires an array of point groups`);
      return points.map(item => point(option, item, 'x')).join(',');
    });
    const byteLimit=option.key==='flush_volumes_matrix'?PURGE_LIMITS.bytes:maxBytes;
    if (bytes(JSON.stringify(output)) > byteLimit) throw new Error(`${option.label} exceeds the ${option.key==='flush_volumes_matrix'?'4 MiB':'64 KB'} setting limit`);
    return output;
  }
  if (option.nativeType === 'coPoint') return point(option, value, ',');
  return scalar(option, value);
}
export function normalizeProfileOverrides(scope, values) {
  if (!indexes[scope]) throw new Error(`Unknown preset scope: ${scope}`);
  if (scope === 'process') return normalizeOverrides(values);
  if (!values || Array.isArray(values) || typeof values !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(values))) throw new Error('Settings must be an object');
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    const option = indexes[scope].get(key);
    if (!option) throw new Error(`Unsupported ${scope} setting: ${key}`);
    result[key] = normalizedValue(option, value);
  }
  return result;
}

// Import accepts native preset membership, including fields omitted from the editor.
// Inheritance/compatibility and remote-host metadata remain the catalog's responsibility.
export function normalizeNativeProfileValues(scope, values) {
  if (!nativeIndexes[scope]) throw new Error(`Unknown preset scope: ${scope}`);
  if (!values || Array.isArray(values) || typeof values !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(values))) throw new Error('Settings must be an object');
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    const option = nativeIndexes[scope].get(key);
    if (!option || excluded.has(key)) throw new Error(`Unsupported ${scope} setting: ${key}`);
    if (option.unresolved.length) throw new Error(`Native metadata for ${key} is not fully supported`);
    const normalized = normalizedValue(option, value);
    if (key === 'post_process' && normalized.some(script => script.trim())) throw new Error('Post-processing scripts are disabled on the web server');
    if (/^(?:print_host|printhost_|flashforge_serial_number|printer_agent|host_type)/.test(key) && normalized !== '' && normalized !== '0') throw new Error(`Printer connection setting ${key} belongs in the Device connection editor`);
    if (['bed_custom_model', 'bed_custom_texture'].includes(key) && normalized !== '') throw new Error(`External asset paths in ${key} cannot be imported`);
    result[key] = normalized;
  }
  return result;
}

function display(option, value) {
  if (value === null || value === 'nil') return null;
  if (['coBool', 'coBools'].includes(option.nativeType)) return value === true || value === 1 || value === '1';
  if (['coPercent', 'coPercents'].includes(option.nativeType)) return String(value).replace(/%$/, '');
  return typeof value === 'object' ? structuredClone(value) : String(value);
}
export function displayedProfileSettings(scope, preset, { includeDefaults = true } = {}) {
  if (!indexes[scope]) throw new Error(`Unknown preset scope: ${scope}`);
  const result = {};
  for (const option of editableDefinitionsByScope[scope]) {
    let value = preset[option.key];
    if (value === undefined && includeDefaults) value = structuredClone(option.default);
    if (value === undefined) continue;
    if (option.nativeType === 'coFloatOrPercent' && typeof value === 'object' && !Array.isArray(value)) value = `${value.value}${value.percent ? '%' : ''}`;
    if (option.nativeType === 'coPoint') result[option.key] = point(option, value, ',');
    else if (['coPoints', 'coPointsGroups'].includes(option.nativeType)) result[option.key] = normalizedValue(option, value);
    else if (vectorTypes[option.nativeType]) result[option.key] = (Array.isArray(value) ? value : [value]).map(item => display(option, item));
    else result[option.key] = display(option, Array.isArray(value) ? value[0] : value);
  }
  return result;
}

export function applyProfileOverrides(scope, preset, values) {
  const result = structuredClone(preset), overrides = normalizeProfileOverrides(scope, values);
  for (const [key, value] of Object.entries(overrides)) result[key] = Array.isArray(value) ? value : Array.isArray(result[key]) && !['coPoint'].includes(indexes[scope].get(key)?.nativeType) ? result[key].map(() => value) : value;
  return result;
}
