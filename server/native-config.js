import {nativeCompatibilitySources,compatibilityBudget} from './native-compatibility.js';
import { readFile, writeFile, mkdtemp, rm, stat, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { runSlicer } from './slicer.js';
import { createPrusaImportQueue } from './native-prusa-queue.js';
import { normalizeProfileOverrides, normalizeNativeProfileValues, normalizeNativeProjectValues, definitionsByScope } from '../shared/profile-settings.js';
import { normalizePurgeSettings } from '../shared/purge-volumes.js';
import { validateNativeVariantVectors } from '../shared/native-variants.js';
export const NATIVE_CONFIG_REVISION = '8500fcdccaa10b5099ac20d252af3a7c560046f1';
export const defaultConfigWorker = process.env.ORCA_CONFIG_WORKER_BIN || fileURLToPath(new URL('../native/build/config/orca-config-worker', import.meta.url));
const queue = createPrusaImportQueue(), cache = new Map();
let cacheBytes = 0;
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const omitted = new Set(['inherits','compatible_printers','compatible_printers_condition','compatible_prints','compatible_prints_condition','bbl_use_printhost','bed_custom_model','bed_custom_texture']);
const connection = /^(?:print_host$|printhost_|flashforge_serial_number$|printer_agent|host_type$|printer_access_code$|access_code$|api_key$|auth_token$|password$|secret$|token$)/;
export function nativeConfigurationScope(scope, values, name, index) {
  const selected = {};
  for (const definition of definitionsByScope[scope]) {
    const value = values[definition.key];
    if (value !== undefined && !connection.test(definition.key) && !omitted.has(definition.key)) selected[definition.key] = scope === 'filament' && index !== undefined && Array.isArray(value) ? [value[index] ?? value[0]] : value;
  }
  return { ...normalizeNativeProfileValues(scope, selected), name, type: scope, from: 'system', instantiation: 'true' };
}
const unavailable = message => Object.assign(new Error(message), { status: 503 });
const aborted = signal => signal?.reason instanceof Error ? signal.reason : Object.assign(new Error('Native configuration resolution cancelled'), { name: 'AbortError', status: 499 });
/** Read through one bounded open descriptor so replacements cannot alias cached
 * configuration. Hashing on each call also catches content changes with restored mtime. */
async function binaryIdentity(binary, signal) {
  let handle;
  try {
    signal?.throwIfAborted();
    handle = await open(binary, 'r');
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > 64n * 1024n * 1024n) throw unavailable('Native configuration helper must be a file of at most64MiB');
    const hash = crypto.createHash('sha256'), chunk = Buffer.alloc(64 * 1024);
    let total = 0;
    for (;;) {
      signal?.throwIfAborted();
      const {bytesRead} = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > 64 * 1024 * 1024) throw unavailable('Native configuration helper exceeds64MiB');
      hash.update(chunk.subarray(0,bytesRead));
    }
    const after = await handle.stat({ bigint: true });
    const stamp = value => [value.dev,value.ino,value.size,value.mtimeNs,value.ctimeNs].join(':');
    if (stamp(before) !== stamp(after)) throw unavailable('Native configuration helper changed during identification; retry');
    signal?.throwIfAborted();
    return `${stamp(after)}:${hash.digest('hex')}`;
  } catch (error) {
    if (signal?.aborted) throw aborted(signal);
    if (['ENOENT','EACCES','EISDIR'].includes(error.code)) throw unavailable('Native configuration helper is unavailable. Build native/config-worker or configure ORCA_CONFIG_WORKER_BIN.');
    throw error;
  } finally { await handle?.close(); }
}
/** One bounded process queue shared by UI resolution and slicing requests.
 * Service lifetimes cancel only their own calls; independently created apps do
 * not shut down each other's queued or running configuration work. */
export async function runNativeConfig(request, { signal, timeoutMs = 30000, workerPath = defaultConfigWorker, runNative = runSlicer, useCache = true } = {}) {
  if (!plain(request) || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000) throw new Error('Invalid native configuration request');
  const bytes = JSON.stringify(request);
  if (Buffer.byteLength(bytes) > 8 * 1024 * 1024) throw new Error('Native configuration input exceeds 8 MiB');
  const deadline = Date.now() + timeoutMs, binary = path.resolve(workerPath);
  const remaining = () => { if (signal?.aborted) throw aborted(signal); const left = deadline - Date.now(); if (left <= 0) throw Object.assign(new Error('Native configuration resolution timed out'), {status:504}); return left; };
  try {
    remaining();
    return await queue.run(async () => {
      remaining();
      const identity = await binaryIdentity(binary, signal);
      remaining();
      const key = crypto.createHash('sha256').update(binary).update(identity).update(bytes).digest('hex');
      if (useCache && cache.has(key)) return structuredClone(cache.get(key).result);
      const directory = await mkdtemp(path.join(tmpdir(), 'orca-config-'));
      try {
        const version = await runNative(binary, ['--version'], { cwd: directory, signal, timeoutMs: remaining() });
        if (version.trim() !== `OrcaConfigWorker-2.4.2 revision${NATIVE_CONFIG_REVISION}`) throw unavailable('Native configuration helper must use pinned OrcaSlicer 2.4.2');
        const input = path.join(directory, 'request.json'), output = path.join(directory, 'result.json');
        await writeFile(input, bytes, { mode: 0o600 });
        await runNative(binary, [input, output], { cwd: directory, signal, timeoutMs: remaining() });
        remaining();
        if ((await stat(output)).size > 16 * 1024 * 1024) throw new Error('Native configuration output exceeds 16 MiB');
        const result = JSON.parse(await readFile(output, 'utf8'));
        const validPayload = request.operation === 'paste-process-settings'
          ? result.settingsClipboardVersion === 1 && Array.isArray(result.settings)
          : request.operation === 'profile-editor-projection'
            ? result.profileEditorVersion === 1 && plain(result.editorSettings) && plain(result.editorSourceIndices)
            : request.operation === 'preset-compatibility'
              ? result.compatibilityVersion === 1 && Array.isArray(result.compatibility)
              : request.operation === 'filament-library-exclusions'
                ? result.compatibilityVersion === 1 && plain(result.exclusions)
                : request.operation === 'user-preset-projection'
                  ? result.userPresetVersion === 1 && plain(result.userPreset) && plain(result.userPreset.settings)
                  : plain(result.effectiveSettings);
        if (result.sourceRevision !== NATIVE_CONFIG_REVISION || !validPayload || !Array.isArray(result.reports)) throw new Error('Invalid native configuration helper output');
        if(request.compatibilityPolicy==='inspect'&&result.compatibilityPolicy!=='inspect')throw unavailable('Native preset editor inspection is unavailable. Rebuild the pinned native configuration helper.');
        if (identity !== await binaryIdentity(binary, signal)) throw unavailable('Native configuration helper changed during execution; retry');
        remaining();
        if (useCache) {
          const size = Buffer.byteLength(JSON.stringify(result));
          while (cache.size && (cache.size >= 32 || cacheBytes + size > 32 * 1024 * 1024)) { const oldest = cache.keys().next().value; cacheBytes -= cache.get(oldest).size; cache.delete(oldest); }
          if (size <= 32 * 1024 * 1024) { cache.set(key, { result: structuredClone(result), size }); cacheBytes += size; }
        }
        return result;
      } finally { await rm(directory, { recursive: true, force: true }); }
    }, { signal, deadline });
  } catch (error) {
    if (signal?.aborted) throw aborted(signal);
    // Preserve identity, name, status and native diagnostic properties.
    const message = error.message.replaceAll('Prusa import', 'configuration resolution').replaceAll('Prusa queue', 'configuration queue');
    if (message !== error.message) error.message = message;
    if (!error.status && /Unsupported configuration operation/.test(error.message)) { error.status=503;error.message+=' Rebuild the pinned native configuration helper to enable this operation.'; }
    if (!error.status && /Native (?:preset|material) is incompatible with selected/.test(error.message)) error.status = 400;
    if (!error.status && /queue is full/.test(error.message)) error.status = 429;
    if (!error.status && /timed out/.test(error.message)) error.status = 504;
    throw error;
  }
}
export function createNativeConfigurationService(defaultOptions = {}) {
  const lifetime = new AbortController(), pending = new Set();
  let closed = false;
  function invoke(operation, options = {}) {
    if (closed) return Promise.reject(aborted(lifetime.signal));
    const signal = options.signal ? AbortSignal.any([lifetime.signal, options.signal]) : lifetime.signal;
    const promise = Promise.resolve().then(() => { signal.throwIfAborted(); return operation({...defaultOptions,...options,signal}); });
    pending.add(promise);
    return promise.finally(() => pending.delete(promise));
  }
  return {
    run: (request, options) => invoke(options => runNativeConfig(request, options), options),
    resolveCatalogNativeSettings: options => invoke(resolveCatalogNativeSettings, options),
    inspectCatalogNativeSettings: options => invoke(inspectCatalogNativeSettings, options),
    resolveEmbeddedNativeSettings: (settings, options) => invoke(options => resolveEmbeddedNativeSettings(settings, options), options),
    async close() {
      closed = true;
      lifetime.abort(Object.assign(new Error('Native configuration service is shutting down'), {name:'AbortError',status:503}));
      await Promise.allSettled([...pending]);
    },
  };
}
/** Resolve trusted system inheritance with native Preset::normalize and full_config(false/true).
 * Client data supplies IDs and validated overrides; it never supplies source paths or raw chains. */
export function resolveCatalogNativeSettings(options) { return resolveCatalogSettings({...options,compatibilityPolicy:'enforce'}); }
// Only the trusted preset editor uses this policy. Public configuration/job
// callers always enter resolveCatalogNativeSettings, which forces enforcement.
export function inspectCatalogNativeSettings(options) { return resolveCatalogSettings({...options,compatibilityPolicy:'inspect'}); }
async function resolveCatalogSettings({ catalog, selection, overrides = {}, compatibilityPolicy, ...options }) {
  if (!catalog || !plain(selection) || !plain(overrides) || Object.keys(overrides).some(key => !['machine', 'process', 'filaments', 'project'].includes(key))) throw new Error('Invalid native preset selection');
  const filamentIds = selection.filamentIds || [selection.filamentId];
  if (!Array.isArray(filamentIds) || !filamentIds.length || filamentIds.length > 64 || filamentIds.some(id => typeof id !== 'string' || !id)) throw new Error('Choose 1–64 filament presets');
  if (overrides.filaments !== undefined && (!Array.isArray(overrides.filaments) || overrides.filaments.length !== filamentIds.length)) throw new Error('Filament overrides must match the selected slot count');
  const selected = catalog.getPreset ? filamentIds.map(filamentId=>({printer:catalog.getPreset(selection.printerId,'machine'),process:catalog.getPreset(selection.processId,'process'),filament:catalog.getPreset(filamentId,'filament'),context:catalog.getSettingsContext?.(catalog.getPreset(selection.printerId,'machine'))})) : await Promise.all(filamentIds.map(filamentId => catalog.resolveSelection({ printerId: selection.printerId, processId: selection.processId, filamentId })));
  const remaining=compatibilityBudget(options);
  const compatibility = catalog.compatibilityCandidates && catalog.supportsNativeCompatibility !== false ? await nativeCompatibilitySources(catalog,(request)=>runNativeConfig(request,remaining()),options) : null;
  const source = async (id, scope, fallback, values) => {
    const result = catalog.getPresetSource ? compatibility?compatibility.source(id,scope):await catalog.getPresetSource(id, scope) : { name: fallback.name, chain: [fallback], snapshot: true };
    return { ...result, overrides: normalizeProfileOverrides(scope, values || {}) };
  };
  const printer = await source(selection.printerId, 'machine', selected[0].printer, overrides.machine), process = await source(selection.processId, 'process', selected[0].process, overrides.process);
  const filaments = await Promise.all(filamentIds.map((id, index) => source(id, 'filament', selected[index].filament, overrides.filaments?.[index])));
  const diameters = overrides.machine?.nozzle_diameter || selected[0].printer.nozzle_diameter;
  const nozzles = Array.isArray(diameters) ? diameters.length : diameters !== undefined ? 1 : 0;
  const project = { ...normalizePurgeSettings(overrides.project || {}, filamentIds.length, { nozzles }), filament_colour: Array(filamentIds.length).fill('#F2754E'), filament_map: Array(filamentIds.length).fill('1'), ...normalizeNativeProjectValues(overrides.project || {}) };
  const result = await runNativeConfig({ printer, process, filaments, project, compatibilityPolicy }, remaining());
  validateNativeVariantVectors(result.archiveSettings, filamentIds.length);
  const effective = result.effectiveSettings;
  return { ...result, selection: { printerId: selection.printerId, processId: selection.processId, filamentIds }, context: selected[0].context,
    printer: nativeConfigurationScope('machine', effective, printer.name), process: {...nativeConfigurationScope('process', effective, process.name),compatible_printers:[printer.name]}, filaments: filaments.map((value, index) => ({...nativeConfigurationScope('filament', effective, value.name, index),compatible_printers:[printer.name]})),
    warnings: [...(result.compatibility||[]).flatMap(item=>(item.diagnostics||[]).map(message=>`Native compatibility expression error in ${item.name}; OrcaSlicer treats that expression as compatible: ${message}`)), ...result.reports.flatMap(report => [...(report.unrecognized?.length ? [`Native preset loader ignored legacy/unknown options: ${report.unrecognized.join(', ')}.`] : []), ...(report.substitutions ? [`Native preset loader made ${report.substitutions} forward compatibility substitutions.`] : []), ...(report.removedMisplaced ? [`Native preset loader removed misplaced options: ${report.removedMisplaced}.`] : [])])] };
}
export async function resolveEmbeddedNativeSettings(settings, options = {}) {
  validateNativeVariantVectors(settings, settings.filament_settings_id?.length);
  return (await runNativeConfig({ embeddedSettings: settings }, options)).effectiveSettings;
}
export async function inspectNativeConfig({workerPath=defaultConfigWorker,runNative=runSlicer}={}) {
  try {
    const version=(await runNative(path.resolve(workerPath),['--version'],{cwd:tmpdir(),timeoutMs:5000})).trim();
    if(version!==`OrcaConfigWorker-2.4.2 revision${NATIVE_CONFIG_REVISION}`)throw new Error('Native configuration helper must use pinned OrcaSlicer 2.4.2');
    return{available:true,version,sourceRevision:NATIVE_CONFIG_REVISION};
  }catch(error){return{available:false,error:`Native preset resolution is unavailable: ${error.message}. Build native/config-worker or configure ORCA_CONFIG_WORKER_BIN.`};}
}
