import {compatibilityMetadata} from './native-compatibility.js';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeOverrides } from '../shared/settings.js';

const TYPES = new Set(['machine', 'process', 'filament']);
const clone = value => structuredClone(value);
const enabled = value => value === true || value === 'true' || value === '1';
const strings = value => Array.isArray(value) ? value : value ? [value] : [];

export class PresetError extends Error {
  constructor(message) { super(message); this.name = 'PresetError'; this.status = 400; }
}

// Resolve only names already indexed from trusted profile files; inherits is never a path.
export function createResolver(records) {
  const byId = new Map(records.map(record => [record.id, record]));
  const cache = new Map();
  function resolve(id, trail = []) {
    if (cache.has(id)) return clone(cache.get(id));
    const record = byId.get(id);
    if (!record) throw new PresetError(`Unknown preset ID: ${id}`);
    if (trail.includes(id)) throw new PresetError(`Preset inheritance cycle: ${[...trail, id].join(' → ')}`);
    let result = {};
    for (const parentName of strings(record.data.inherits)) {
      if (typeof parentName !== 'string' || !parentName.trim()) throw new PresetError(`Invalid parent in ${record.data.name}`);
      const candidates = records.filter(candidate => candidate.type === record.type && candidate.data.name === parentName);
      const local = candidates.filter(candidate => candidate.vendor === record.vendor);
      const matches = local.length ? local : candidates;
      if (matches.length !== 1) throw new PresetError(`${matches.length ? 'Ambiguous' : 'Missing'} parent ${parentName} for ${record.data.name}`);
      result = { ...result, ...resolve(matches[0].id, [...trail, id]) };
    }
    result = { ...result, ...clone(record.data) };
    delete result.inherits;
    cache.set(id, result);
    return clone(result);
  }
  return resolve;
}

async function isDirectory(directory) {
  try { return (await stat(directory)).isDirectory(); } catch { return false; }
}

export async function discoverProfilesDirectory({ binary, resourcesDir, profilesDir } = {}) {
  const explicitProfiles = profilesDir || process.env.ORCA_PROFILES_DIR;
  const explicitResources = resourcesDir || process.env.ORCA_RESOURCES_DIR;
  if (explicitProfiles || explicitResources) {
    const directory = path.resolve(explicitProfiles || path.join(explicitResources, 'profiles'));
    if (!await isDirectory(directory)) throw new Error(`Orca profile directory does not exist: ${directory}`);
    return directory;
  }
  const candidates = [];
  if (binary && path.isAbsolute(binary)) {
    const binaryDirectory = path.dirname(binary);
    candidates.push(path.resolve(binaryDirectory, '../Resources/profiles'));
    candidates.push(path.resolve(binaryDirectory, '../resources/profiles'));
    candidates.push(path.resolve(binaryDirectory, '../share/OrcaSlicer/profiles'));
    candidates.push(path.resolve(binaryDirectory, 'resources/profiles'));
  }
  if (process.platform === 'darwin') candidates.push('/Applications/OrcaSlicer.app/Contents/Resources/profiles');
  candidates.push('/usr/share/OrcaSlicer/profiles', '/usr/local/share/OrcaSlicer/profiles', '/opt/orca-slicer/resources/profiles');
  for (const candidate of candidates) if (await isDirectory(candidate)) return candidate;
  throw new Error('Orca system presets were not found. Set ORCA_RESOURCES_DIR or ORCA_PROFILES_DIR.');
}

async function readRecords(directory) {
  const records = [];
  const warnings = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const data = JSON.parse(await readFile(filename, 'utf8'));
          if ((!TYPES.has(data.type) && data.type !== 'machine_model') || typeof data.name !== 'string') continue;
          // This catalog intentionally reads bundled system presets only, never account data.
          if (data.from && data.from !== 'system') continue;
          const relative = path.relative(directory, filename).split(path.sep).join('/');
          const vendor = relative.split('/')[0];
          const id = `${data.type}-${crypto.createHash('sha256').update(relative).digest('hex').slice(0, 20)}`;
          records.push({ id, vendor, type: data.type, data, source: relative });
        } catch (error) { warnings.push(`Could not read preset ${path.relative(directory, filename)}: ${error.message}`); }
      }
    }
  }
  await visit(directory);
  return { records, warnings };
}

export function isCompatible(preset, printer) {
  const allowed = strings(preset.compatible_printers);
  if (allowed.length && !allowed.includes(printer.name) && !allowed.includes(printer.printer_settings_id)) return false;
  // Orca condition expressions are a separate language. Do not claim compatibility
  // for presets requiring an expression we cannot evaluate.
  if (typeof preset.compatible_printers_condition === 'string' && preset.compatible_printers_condition.trim()) return false;
  return true;
}

export function applyProcessOverrides(processPreset, overrides = {}) {
  let normalized;
  try { normalized = normalizeOverrides(overrides); }
  catch (error) { throw new PresetError(error.message); }
  const result = clone(processPreset);
  for (const [key, value] of Object.entries(normalized)) {
    // Newer Orca versions use arrays for extruder variants. Keep that native shape.
    result[key] = Array.isArray(value) ? value : Array.isArray(result[key]) ? result[key].map(() => value) : value;
  }
  return result;
}

function nativeConfig(data, type) {
  const result = { ...clone(data), type, from: 'system', instantiation: 'true' };
  delete result.inherits;
  if (type === 'machine') result.printer_settings_id = data.name;
  if (type === 'process') result.print_settings_id = data.name;
  if (type === 'filament') result.filament_settings_id = [data.name];
  return result;
}

export async function createPresetCatalog(options = {}) {
  const directory = await discoverProfilesDirectory(options);
  const { records, warnings } = await readRecords(directory);
  const resourcesDirectory = path.resolve(options.resourcesDir || process.env.ORCA_RESOURCES_DIR || path.dirname(directory));
  const machineModels = records.filter(record => record.type === 'machine_model').map(record => ({ name: record.data.name, vendor: record.vendor, modelId: typeof record.data.model_id === 'string' ? record.data.model_id : '', source: record.source }));
  // Native model IDs come from the vendor index, while display names come from
  // each referenced machine_model JSON. Hotend lookup distinguishes the two.
  const hotendModels=[],hotendWarnings=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
    const vendor=entry.name.slice(0,-5);
    try{const index=JSON.parse(await readFile(path.join(directory,entry.name),'utf8'));
      if(!Array.isArray(index.machine_model_list))continue;
      for(const model of index.machine_model_list){
        const record=records.find(item=>item.type==='machine_model'&&item.source===`${vendor}/${model.sub_path}`);
        if(typeof model.name!=='string'||!record){hotendWarnings.push(`Native hotend model metadata is unavailable for ${vendor}.`);continue;}
        hotendModels.push({id:model.name,name:record.data.name,vendor,hotendModel:typeof record.data.hotend_model==='string'?record.data.hotend_model:'',source:record.source});
      }
    }catch{hotendWarnings.push(`Native hotend vendor metadata could not be read for ${vendor}.`);}
  }
  const capabilityDirectory = path.join(resourcesDirectory, 'printers');
  const capabilityDirectoryExists = await isDirectory(capabilityDirectory);
  const capabilities = new Map();
  for (const modelId of new Set(machineModels.map(model => model.modelId).filter(Boolean))) {
    // Model IDs are trusted native identifiers, never relative filesystem paths.
    if (!/^[A-Za-z0-9_-]+$/.test(modelId)) { capabilities.set(modelId, { value: null, error: 'Invalid native printer model ID.' }); continue; }
    const filename = `printers/${modelId}.json`;
    if (!capabilityDirectoryExists) { capabilities.set(modelId, { value: null, error: 'Native printer capability directory is unavailable.', source: filename }); continue; }
    try {
      const document = JSON.parse(await readFile(path.join(resourcesDirectory, filename), 'utf8'));
      const value = document['00.00.00.00']?.support_wrapping_detection;
      capabilities.set(modelId, value === undefined ? { value: false, source: filename } : typeof value === 'boolean' ? { value, source: filename } : { value: null, error: 'Native wrapping-detection capability is not a boolean.', source: filename });
    } catch (error) {
      capabilities.set(modelId, error.code === 'ENOENT' ? { value: false, source: filename } : { value: null, error: `Native printer capability could not be read: ${error.message}`, source: filename });
    }
  }
  function getSettingsContext(printer) {
    const modelName = typeof printer.printer_model === 'string' ? printer.printer_model : '';
    // Native vendors are stored in std::map; first lexical vendor match wins.
    const model = machineModels.filter(item => item.name === modelName).sort((a, b) => a.vendor < b.vendor ? -1 : a.vendor > b.vendor ? 1 : 0)[0];
    const complete = warnings.length === 0;
    const capability = model?.modelId ? capabilities.get(model.modelId) : { value: model || complete ? false : null, error: !model && !complete ? 'Native machine-model index contains unreadable files.' : undefined };
    return { isBblPrinter: model ? model.vendor === 'BBL' : complete ? false : null, supportWrappingDetection: capability?.value ?? null,
      printerModel: modelName, vendor: model?.vendor ?? null, modelId: model?.modelId ?? null,
      provenance: { nativeVersion: '2.4.2', vendorRule: 'PresetBundle.cpp:612', capabilityRule: 'DevConfigUtil.h:98', modelSource: model?.source ?? null, capabilitySource: capability?.source ?? null },
      warnings: capability?.error ? [capability.error] : [] };
  }
  const resolve = createResolver(records);
  const available = [];
  for (const record of records.filter(record => enabled(record.data.instantiation))) {
    try { available.push({ ...record, config: resolve(record.id) }); }
    catch (error) { warnings.push(error.message); }
  }
  available.sort((a, b) => a.data.name.localeCompare(b.data.name));
  const byId = new Map(available.map(record => [record.id, record]));
  function requirePreset(id, type) {
    const record = byId.get(id);
    if (!record || record.type !== type) throw new PresetError(`Unknown ${type} preset ID: ${id}`);
    return record;
  }
  const machines = available.filter(record => record.type === 'machine' && record.config.printer_technology !== 'SLA');
  const preferred = machines.find(record => record.data.name === 'Prusa MK4 0.4 nozzle') || machines[0];
  if (!preferred) throw new Error('No valid Orca machine presets were found');
  function choices(printer) {
    return available.filter(record => record.type !== 'machine' && isCompatible(record.config, printer.config));
  }
  function defaultsFor(printer, compatible) {
    const processRecords = compatible.filter(record => record.type === 'process');
    const filamentRecords = compatible.filter(record => record.type === 'filament');
    const processPreset = processRecords.find(record => record.data.name === printer.config.default_print_profile) || processRecords[0];
    const filamentNames = strings(printer.config.default_filament_profile);
    const filamentPreset = filamentRecords.find(record => filamentNames.includes(record.data.name)) || filamentRecords.find(record => record.config.filament_type?.[0] === 'PLA') || filamentRecords[0];
    return { printerId: printer.id, processId: processPreset?.id || null, filamentId: filamentPreset?.id || null };
  }
  function summary(record) {
    return {
      id: record.id, name: record.data.name, vendor: record.vendor,
      ...(record.type === 'machine' ? { nozzleDiameter: record.config.nozzle_diameter, printableArea: record.config.printable_area, printableHeight: record.config.printable_height } : {}),
      ...(record.type === 'process' ? { layerHeight: record.config.layer_height } : {}),
      ...(record.type === 'filament' ? { type: strings(record.config.filament_type)[0] || '' } : {})
    };
  }
  function metadataFor(record) { return compatibilityMetadata({id:record.id,type:record.type,name:record.data.name,vendor:record.vendor,config:record.config,leaf:record.data,isSystem:true,parent:strings(record.data.inherits)[0]||''}); }
  return {
    directory,
    compatibilityMetadata(id,type) { return metadataFor(requirePreset(id,type)); },
    compatibilityCandidates() { return available.filter(record=>record.type==='process'||record.type==='filament').map(record=>({id:record.id,type:record.type,summary:summary(record),metadata:metadataFor(record)})); },
    getSettingsContext,
    getPresetSource(id, type) {
      const leaf = requirePreset(id, type), chain = [], vendors = [];
      function visit(record, trail = []) {
        if (trail.includes(record.id) || trail.length >= 64) throw new PresetError('Native preset inheritance cycle or depth limit');
        const parents = strings(record.data.inherits);
        if (parents.length > 1) throw new PresetError('Native system presets support one parent per inheritance step');
        for (const name of parents) {
          const candidates = records.filter(item => item.type === type && item.data.name === name), local = candidates.filter(item => item.vendor === record.vendor), matches = local.length ? local : candidates;
          if (matches.length !== 1) throw new PresetError(`Missing or ambiguous native parent ${name}`);
          visit(matches[0], [...trail, record.id]);
        }
        chain.push(clone(record.data)); vendors.push(record.vendor);
      }
      visit(leaf);
      return { name: leaf.data.name, vendor: leaf.vendor, chain, vendors, metadata:metadataFor(leaf) };
    },
    listMachineModels() { return clone(machineModels); },
    listHotendModels() { return clone({models:hotendModels,warnings:hotendWarnings}); },
    getPreset(id, type) { return nativeConfig(requirePreset(id, type).config, type); },
    findPresets(name, type) {
      return records.filter(record => record.type === type && record.data.name === name).flatMap(record => {
        try { return [{ id: record.id, config: nativeConfig(resolve(record.id), type) }]; }
        catch { return []; }
      });
    },
    list({ printerId } = {}) {
      const printer = printerId ? requirePreset(printerId, 'machine') : preferred;
      const compatible = choices(printer);
      return {
        printers: machines.map(summary),
        processes: compatible.filter(record => record.type === 'process').map(summary),
        filaments: compatible.filter(record => record.type === 'filament').map(summary),
        defaults: defaultsFor(printer, compatible), warnings,
        limitations: ['Bundled system presets only; importing native user presets is not implemented.', 'Presets requiring compatibility expressions are omitted until expression evaluation is supported.']
      };
    },
    resolveSelection({ printerId, processId, filamentId, overrides = {} }) {
      const printer = requirePreset(printerId, 'machine');
      const processPreset = requirePreset(processId, 'process');
      const filament = requirePreset(filamentId, 'filament');
      for (const preset of [processPreset, filament]) if (!isCompatible(preset.config, printer.config)) throw new PresetError(`${preset.data.name} is incompatible with ${printer.data.name}`);
      return {
        context: getSettingsContext(printer.config),
        printer: nativeConfig(printer.config, 'machine'),
        process: nativeConfig(applyProcessOverrides(processPreset.config, overrides), 'process'),
        filament: nativeConfig(filament.config, 'filament')
      };
    }
  };
}
