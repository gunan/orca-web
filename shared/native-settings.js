import schema from './native-process-schema.json' with { type: 'json' };

export const nativeSchema = schema;
const scalarTypes = {
  coFloat: 'number', coInt: 'number', coPercent: 'number', coBool: 'boolean',
  coEnum: 'enum', coFloatOrPercent: 'floatOrPercent', coString: 'string',
  coFloats: 'vector', coInts: 'vector', coStrings: 'vector'
};
const vectorTypes = { coFloats: 'coFloat', coInts: 'coInt', coStrings: 'coString' };

export const settingDefinitions = schema.options.map(option => ({
  ...option,
  type: scalarTypes[option.nativeType],
  integer: option.nativeType === 'coInt',
  ...(option.options ? { options: option.options.map(item => item.value), optionLabels: Object.fromEntries(option.options.map(item => [item.value, item.label])) } : {})
}));

export const editableSettingDefinitions = settingDefinitions.filter(option => option.ui && !option.readOnly && option.unresolved.length === 0)
  .sort((left, right) => left.ui.order - right.ui.order);

// Pages and section names come directly from TabPrint::build(), not from a
// guessed category mapping. Each row retains ui.group for section rendering.
export const settingGroups = Object.fromEntries([...new Set(editableSettingDefinitions.map(option => option.ui.page))]
  .map(page => [page, editableSettingDefinitions.filter(option => option.ui.page === page)]));

const editable = new Map(editableSettingDefinitions.map(definition => [definition.key, definition]));
const maxStringBytes = 64 * 1024;
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function normalizeScalar(definition, value, nativeType = definition.nativeType) {
  const name = definition.fullLabel || definition.label || definition.key;
  if (nativeType === 'coBool') {
    if (![true, false, '0', '1'].includes(value)) throw new Error(`${name} must be a boolean`);
    return value === true || value === '1' ? '1' : '0';
  }
  if (nativeType === 'coEnum') {
    if (!definition.options.includes(value)) throw new Error(`Invalid ${name}: ${String(value)}`);
    return value;
  }
  if (nativeType === 'coString') {
    if (typeof value !== 'string') throw new Error(`${name} must be a string`);
    if (new TextEncoder().encode(value).byteLength > maxStringBytes) throw new Error(`${name} exceeds the 64 KB setting limit`);
    if (value.includes('\0')) throw new Error(`${name} cannot contain a null character`);
    return value;
  }
  if (!['coFloat', 'coInt', 'coPercent', 'coFloatOrPercent'].includes(nativeType)) throw new Error(`Unsupported native type: ${nativeType}`);
  if (!['number', 'string'].includes(typeof value)) throw new Error(`${name} must be a number`);
  let text = String(value).trim();
  const percent = text.endsWith('%');
  if (percent && !['coPercent', 'coFloatOrPercent'].includes(nativeType)) throw new Error(`${name} does not accept percentages`);
  if (percent) text = text.slice(0, -1).trim();
  const number = Number(text);
  if (definition.minimumExclusive !== undefined && number <= definition.minimumExclusive) throw new Error(`${name} must be greater than ${definition.minimumExclusive}`);
  if (!decimal.test(text) || !Number.isFinite(number) || number < definition.min || number > definition.max || (nativeType === 'coInt' && (!Number.isInteger(number) || number < -2147483648 || number > 2147483647))) {
    throw new Error(`${name} must be ${nativeType === 'coInt' ? 'an integer' : 'a number'} between ${definition.min} and ${definition.max}`);
  }
  return `${number}${nativeType === 'coPercent' || percent ? '%' : ''}`;
}

export function normalizeOverrides(values, { allowPostProcess = false } = {}) {
  if (!values || Array.isArray(values) || typeof values !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(values))) throw new Error('Settings must be an object');
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    const definition = editable.get(key);
    if (!definition) throw new Error(`Unsupported process setting: ${key}`);
    if (vectorTypes[definition.nativeType]) {
      if (!Array.isArray(value)) throw new Error(`${definition.label} must be an array`);
      const normalized = value.map(item => normalizeScalar(definition, item, vectorTypes[definition.nativeType]));
      if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > maxStringBytes) throw new Error(`${definition.label} exceeds the 64 KB setting limit`);
      if (key === 'post_process' && !allowPostProcess && normalized.some(script => script.trim())) throw new Error('Post-processing scripts are disabled on the web server');
      result[key] = normalized;
    } else result[key] = normalizeScalar(definition, value);
  }
  return result;
}

function defaultValue(definition) {
  const value = definition.default;
  if (definition.nativeType === 'coFloatOrPercent') return `${value.value}${value.percent ? '%' : ''}`;
  return structuredClone(value);
}

function displayScalar(definition, value, nativeType = definition.nativeType) {
  if (nativeType === 'coBool') return value === true || value === '1' || value === 1;
  if (nativeType === 'coPercent') return String(value).replace(/%$/, '');
  return String(value);
}

export function displayedSettings(processPreset, { includeDefaults = false } = {}) {
  const result = {};
  for (const definition of editableSettingDefinitions) {
    let value = processPreset[definition.key];
    if (value === undefined && includeDefaults) value = defaultValue(definition);
    if (value === undefined) continue;
    const vectorType = vectorTypes[definition.nativeType];
    if (vectorType) {
      result[definition.key] = (Array.isArray(value) ? value : [value]).map(item => displayScalar(definition, item, vectorType));
    } else {
      // Native preset arrays for extruder variants retain the original one-value
      // process editor behavior. Actual native vector settings above stay arrays.
      const scalar = Array.isArray(value) ? value[0] : value;
      if (scalar !== undefined) result[definition.key] = displayScalar(definition, scalar);
    }
  }
  return result;
}
