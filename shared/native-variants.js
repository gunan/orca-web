import schema from './native-variant-schema.json' with { type: 'json' };
export { schema as nativeVariantSchema };
const vectors = value => Array.isArray(value) ? value : value === undefined ? [] : [value];
const positiveIds = (values, maximum, label) => {
  if (!Array.isArray(values) || !values.length || values.length > 1024 || values.some(value => !/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > maximum)) throw new Error(`Invalid ${label}`);
  return values.map(Number);
};
const variantValues = new Set(['Direct Drive Standard', 'Direct Drive High Flow', 'Bowden Standard', 'Bowden High Flow']);
function variantMap(settings, idKey, variantKey, count, label) {
  const variants = vectors(settings[variantKey]);
  if (variants.length <= count) {
    if (settings[idKey] && variants.length === count && vectors(settings[idKey]).length === count) {
      const ids = positiveIds(settings[idKey],count,`${label} variant identities`);
      if (new Set(ids).size !== count) throw new Error(`Duplicate ${label} variant identities`);
    }
    return null;
  }
  const ids = positiveIds(settings[idKey], count, `${label} variant identities`);
  if (ids.length !== variants.length || variants.some(value => !variantValues.has(value))) throw new Error(`Incomplete ${label} variant map`);
  const keys = ids.map((id, index) => `${id}:${variants[index]}`);
  if (new Set(keys).size !== keys.length || new Set(ids).size !== count) throw new Error(`Duplicate or missing ${label} variant identities`);
  return { ids, variants };
}
/** Validate expanded native variant vectors without flattening their archive representation.
 * Legacy one-value/default vectors retain their established native fallback behavior. */
export function validateNativeVariantVectors(settings, filamentCount) {
  const nozzleCount = vectors(settings.nozzle_diameter).length;
  if (!Number.isInteger(filamentCount) || filamentCount < 1 || filamentCount > 64 || nozzleCount < 1 || nozzleCount > 64) throw new Error('Native variant context requires 1–64 materials and physical nozzles');
  if (settings.filament_map !== undefined && (positiveIds(settings.filament_map,nozzleCount,'filament map').length !== filamentCount)) throw new Error('Filament mapping must contain one entry per material');
  const filament = variantMap(settings, 'filament_self_index', 'filament_extruder_variant', filamentCount, 'filament');
  const printer = variantMap(settings, 'printer_extruder_id', 'printer_extruder_variant', nozzleCount, 'printer');
  const process = variantMap(settings, 'print_extruder_id', 'print_extruder_variant', nozzleCount, 'process');
  if (filament && !settings.filament_map) throw new Error('Expanded filament variants require a native filament map');
  if ((filament || printer || process) && (!vectors(settings.extruder_type).length || !vectors(settings.nozzle_volume_type).length)) throw new Error('Expanded variants require native extruder type and nozzle volume context');
  const groups = [
    [schema.filament_options_with_variant, filament, filamentCount, 1, 'filament'],
    [schema.printer_options_with_variant_1, printer, nozzleCount, 1, 'printer'],
    [schema.printer_options_with_variant_2, printer, nozzleCount, 2, 'printer'],
    [schema.print_options_with_variant, process, nozzleCount, 1, 'process']
  ];
  for (const [keys, map, count, stride, label] of groups) for (const key of keys) {
    if (settings[key] === undefined) continue;
    const length = vectors(settings[key]).length;
    if (map && length !== map.variants.length * stride) throw new Error(`${key} must contain ${map.variants.length * stride} values for the ${label} variant map`);
    if (!map && length > count * stride) throw new Error(`${key} requires a complete ${label} variant map`);
  }
  return { filamentVariantCount: filament?.variants.length || filamentCount, printerVariantCount: printer?.variants.length || nozzleCount, expanded: Boolean(filament || printer || process) };
}
export function hasExpandedNativeVariants(settings) {
  return vectors(settings.filament_extruder_variant).length > vectors(settings.filament_settings_id).length || vectors(settings.printer_extruder_variant).length > vectors(settings.nozzle_diameter).length || vectors(settings.print_extruder_variant).length > vectors(settings.nozzle_diameter).length;
}
/** Reindex complete per-material variant blocks when slots are inserted/removed.
 * Null imports repeat the chosen source material, matching the caller's native operation. */
export function resizeNativeFilamentVariants(settings, indices, { cloneSlot = 0 } = {}) {
  const count = vectors(settings.filament_settings_id).length;
  const mapping = variantMap(settings, 'filament_self_index', 'filament_extruder_variant', count, 'filament');
  if (!mapping) return {};
  validateNativeVariantVectors(settings, count);
  if (!Array.isArray(indices) || !indices.length || indices.length > 64 || !Number.isInteger(cloneSlot) || cloneSlot < 0 || cloneSlot >= count || indices.some(index => index !== null && (!Number.isInteger(index) || index < 0 || index >= count))) throw new Error('Invalid material variant resize');
  const sourceIndices = [], identities = [];
  for (const [newIndex, oldIndex] of indices.entries()) for (const [index, id] of mapping.ids.entries()) if (id === (oldIndex ?? cloneSlot) + 1) { sourceIndices.push(index); identities.push(String(newIndex + 1)); }
  if (identities.length > 1024) throw new Error('Material variant resize exceeds the native vector limit');
  return { ...Object.fromEntries(schema.filament_options_with_variant.filter(key => settings[key] !== undefined).map(key => [key, sourceIndices.map(index => settings[key][index])])), filament_self_index: identities };
}
