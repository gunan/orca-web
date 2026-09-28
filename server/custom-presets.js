import {normalizeUserPresetValues,projectNativeUserPreset,resolveNativeUserPresetBase} from './native-user-presets.js';
import {normalizeNativeCompatibility,nativeCompatibilityFromConfig,mergeNativeCompatibility} from '../shared/preset-compatibility.js';
import {compatibilityMetadata,listNativeCompatiblePresets} from './native-compatibility.js';
import {createNativeConfigurationService,nativeConfigurationScope} from './native-config.js';
import {needsNativeProfileContext,nativeScopeDifference,resolveNativeProfileContext} from './native-profile-editor.js';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { applyProfileOverrides, displayedProfileSettings, normalizeProfileOverrides, normalizeNativeProfileValues, normalizeNativeProjectValues, editableDefinitionsByScope } from '../shared/profile-settings.js';

import { getNativeCorrectionPlan, applyNativeCorrectionDecisions } from '../shared/native-setting-corrections.js';
import { validateNativeConfiguration } from '../shared/native-config-validation.js';

const TYPES = ['machine', 'process', 'filament'];
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const clone = value => structuredClone(value);
const strings = value => Array.isArray(value) ? value : value ? [value] : [];
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const validName = name => {
  if (typeof name !== 'string' || !name.trim() || name.length > 160 || /[\x00-\x1f\x7f]/.test(name)) throw error('Preset name must contain 1–160 printable characters.');
  return name.trim();
};
// SavePresetDialog's portable native file-name restrictions. Existing legacy
// snapshots are not renamed or rejected merely because this feature was added.
function validNativeName(name) {
  const value=validName(name);
  if(value!==name || /[<>\[\]:/\\|?*"]/.test(value) || ['Default Setting','Default Filament','Default Printer'].includes(value)) throw error('Choose a native preset name without reserved characters or surrounding spaces.');
  return value;
}
function safeConfig(config) {
  if (strings(config.post_process).some(value => typeof value !== 'string' || value.trim())) throw error('Post-processing scripts are disabled on the web server.');
  for (const key of ['printhost_apikey', 'printhost_password', 'printhost_user']) if (strings(config[key]).some(value => value !== '')) throw error(`Preset contains ${key}; manage credentials in the Device connection editor.`);
  return config;
}
function nativeConfig(config, type, name = config.name, from = 'system') {
  const output = { ...clone(safeConfig(config)), name, type, from, instantiation: 'true' };
  delete output.inherits;
  if (type === 'machine') output.printer_settings_id = name;
  if (type === 'process') output.print_settings_id = name;
  if (type === 'filament') output.filament_settings_id = [name];
  return output;
}
function publicSummary(record, config) {
  return { id: record.id, name: record.name, vendor: 'Local custom', custom: true,
    ...(record.type === 'machine' ? { nozzleDiameter: config.nozzle_diameter, printableArea: config.printable_area, printableHeight: config.printable_height } : {}),
    ...(record.type === 'process' ? { layerHeight: config.layer_height } : {}),
    ...(record.type === 'filament' ? { type: strings(config.filament_type)[0] || '' } : {}) };
}
function compatible(config, printer, aliases = []) {
  if (typeof config.compatible_printers_condition === 'string' && config.compatible_printers_condition.trim()) return false;
  const names = strings(config.compatible_printers);
  return !names.length || names.some(name => [printer.name, printer.printer_settings_id, ...aliases].includes(name));
}

export class CustomPresetStore {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'custom-presets.json'); this.items = []; this.queue = Promise.resolve(); }
  async init() {
    await mkdir(this.directory, { recursive: true });
    let text;
    try { text = await readFile(this.file, 'utf8'); } catch (failure) { if (failure.code === 'ENOENT') return; throw failure; }
    let data;
    try {
      data = JSON.parse(text);
      if (!Array.isArray(data) || new Set(data.map(item => item?.id)).size !== data.length) throw new Error();
      for (const item of data) {
        if (!plain(item) || !TYPES.includes(item.type) || !new RegExp(`^custom-${item.type}-[a-f0-9-]{36}$`).test(item.id) || validName(item.name) !== item.name || !plain(item.baseConfig) || !plain(item.settings) || !Array.isArray(item.compatiblePrinterIds) || !Array.isArray(item.printerAliases)) throw new Error();
        normalizeProfileOverrides(item.type, item.settings); safeConfig(item.baseConfig);
        if(item.nativeCompatibility!==undefined)item.nativeCompatibility=normalizeNativeCompatibility(item.type,item.nativeCompatibility);
        if(item.nativeParent!==undefined&&(typeof item.nativeParent!=='string'||item.nativeParent.length>1000||item.nativeParent.includes('\0')))throw new Error();
        if(item.nativeDocument!==undefined||item.nativeFullSettings!==undefined){
          if(!plain(item.nativeDocument)||!plain(item.nativeFullSettings)||typeof item.nativeParent!=='string')throw new Error();
          normalizeUserPresetValues(item.type,item.nativeDocument);normalizeUserPresetValues(item.type,item.nativeFullSettings);
          if(item.nativeDocument.name!==item.name||(item.nativeDocument.inherits||'')!==item.nativeParent)throw new Error();
        }
      }
    } catch { throw new Error('Invalid custom preset store. Repair custom-presets.json before starting the server.'); }
    this.items = data;
  }
  get(id) { return clone(this.items.find(item => item.id === id)); }
  list() { return clone(this.items); }
  mutate(callback) {
    const task = this.queue.then(async () => {
      const { items, result } = await callback(clone(this.items));
      const temporary = `${this.file}.${crypto.randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(items), { mode: 0o600, flag: 'wx' });
        await rename(temporary, this.file); this.items = items; return clone(result);
      } finally { await unlink(temporary).catch(() => {}); }
    });
    this.queue = task.catch(() => {}); return task;
  }
}

export async function createCustomPresetCatalog({ baseCatalog, dataDir, nativeConfig: nativeConfiguration = createNativeConfigurationService() }) {
  if (typeof baseCatalog.getPreset !== 'function') throw new Error('Native preset catalog must expose getPreset(id,type).');
  const store = new CustomPresetStore(path.join(dataDir, 'presets')); await store.init();
  function requireRecord(id, type) {
    const record = store.get(id);
    if (!record || (type && type !== record.type)) throw error('Custom preset not found.', 404);
    return record;
  }
  function customMetadata(record) { const config=configOf(record);return compatibilityMetadata({id:record.id,type:record.type,name:record.name,vendor:'',config,isSystem:false,parent:record.nativeParent ?? record.baseName ?? ''}); }
  function dependenciesOf(record) { return record.nativeCompatibility ?? (record.type==='machine'?{}:{...nativeCompatibilityFromConfig(record.type,record.baseConfig),compatible_printers:record.compatiblePrinterIds.map(id=>getPreset(id,'machine').name)}); }
  function configOf(record) { return {...nativeConfig(record.nativeFullSettings??applyProfileOverrides(record.type, record.baseConfig, record.settings), record.type, record.name,record.nativeFullSettings?'user':'system'),...dependenciesOf(record)}; }
  function parentMatch(name,type,items=store.list()) {
    if(!name)return undefined;
    const matches=[...items.filter(item=>item.type===type&&item.name===name).map(record=>({id:record.id,record})),...(baseCatalog.findPresets?.(name,type)||[])];
    if(matches.length!==1)throw error(`${matches.length?'Ambiguous':'Unknown'} inherited ${type} preset: ${name}`);
    return matches[0];
  }
  async function resolvedParent(name,type,items=store.list()) {
    const match=parentMatch(name,type,items);if(!match)return undefined;
    if(match.record?.nativeFullSettings)return{name,settings:clone(match.record.nativeFullSettings)};
    const source=match.record?{name,chain:[configOf(match.record)],snapshot:true}:baseCatalog.getPresetSource?.(match.id,type)||{name,chain:[match.config],snapshot:true};
    return{name,settings:await resolveNativeUserPresetBase({type,source},{nativeConfig:nativeConfiguration})};
  }
  async function editorBaseline(record) {
    if(!record.nativeDocument)return record.baseConfig;
    return (await resolvedParent(record.nativeParent,record.type))?.settings??record.nativeFullSettings;
  }
  function retainNativeProjection(record,projection,parent) {
    const full=projection.nativeFullSettings;
    return {...record,...projection,baseConfig:clone(parent?.settings??full),settings:nativeScopeDifference(record.type,parent?.settings??full,full),nativeCompatibility:nativeCompatibilityFromConfig(record.type,full),compatiblePrinterIds:idsForDependencies(record.type,nativeCompatibilityFromConfig(record.type,full))};
  }
  async function reloadNativeChildren(items,parent) {
    // PresetCollection::save_current_preset only reloads direct children when
    // the edited user preset is a root. Preserve that native distinction.
    if(parent.nativeParent)return items;
    const result=[];
    for(const item of items){
      if(item.id===parent.id||item.type!==parent.type||!item.nativeDocument||item.nativeParent!==parent.name){result.push(item);continue;}
      const ancestor={name:parent.name,settings:parent.nativeFullSettings};
      const projection=await projectNativeUserPreset({type:item.type,mode:'reload',name:item.name,document:item.nativeDocument,parent:ancestor,filamentId:item.nativeFullSettings.filament_id},{nativeConfig:nativeConfiguration});
      result.push(retainNativeProjection(item,projection,ancestor));
    }
    return result;
  }
  function basePrinterName(id,seen=new Set()) {
    if(seen.has(id))throw error('Cyclic custom printer inheritance.');seen.add(id);
    const record=store.get(id);if(!record)return getPreset(id,'machine').name;
    const parent=record.nativeParent ?? record.baseName ?? '';if(!parent)return record.name;
    const matches=catalog.findPresets(parent,'machine');if(matches.length!==1)throw error('Native base printer is unavailable.');
    return basePrinterName(matches[0].id,seen);
  }
  function savedParent(baseId,type) {const source=store.get(baseId);return source?(source.nativeParent ?? source.baseName ?? '')||source.name:getPreset(baseId,type).name;}
  function dependencyOptions(type,printerId) {
    if(type==='machine')return{};
    const tech=printerId?getPreset(printerId,'machine').printer_technology||'FFF':'FFF';
    return {printers:machineChoices().filter(item=>(getPreset(item.id,'machine').printer_technology||'FFF')===tech).map(item=>({id:item.id,name:item.name})),processes:[...(baseCatalog.compatibilityCandidates?.()||[]).filter(item=>item.type==='process').map(item=>({id:item.id,name:item.metadata.name})),...store.list().filter(item=>item.type==='process').map(item=>({id:item.id,name:item.name}))]};
  }
  function compatibilityInput(input,current,type,baseConfig) {
    if(input.nativeCompatibility!==undefined && input.compatiblePrinterIds!==undefined)throw error('Supply native compatibility fields or legacy compatible printer IDs, not both.');
    if(input.nativeCompatibility!==undefined)return normalizeNativeCompatibility(type,input.nativeCompatibility);
    if(input.compatiblePrinterIds!==undefined)return undefined;
    if(!current&&(input.nativeEditor===true||store.get(input.baseId)?.nativeDocument))return nativeCompatibilityFromConfig(type,baseConfig);
    return current?.nativeCompatibility===undefined?undefined:normalizeNativeCompatibility(type,current.nativeCompatibility);
  }
  function idsForDependencies(type,metadata) {return type==='machine'?[]:machineChoices().filter(item=>metadata.compatible_printers.includes(item.name)).map(item=>item.id);}
  function getPreset(id, type) {
    if (!TYPES.includes(type)) throw error('Choose a machine, process, or filament preset.');
    const record = store.get(id);
    if (record) { if (record.type !== type) throw error(`Preset ${id} is not a ${type} preset.`); return configOf(record); }
    try { return clone(safeConfig(baseCatalog.getPreset(id, type))); } catch (failure) { throw error(failure.message, failure.status || 400); }
  }
  function machineChoices() {
    return [...baseCatalog.list().printers, ...store.list().filter(item => item.type === 'machine').map(item => publicSummary(item, configOf(item)))];
  }
  function validatePrinterIds(ids, type) {
    if (type === 'machine') { if (ids !== undefined && (!Array.isArray(ids) || ids.length)) throw error('Machine presets do not have compatible printer IDs.'); return []; }
    if (!Array.isArray(ids) || !ids.length || ids.length > 10000 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw error('Select one or more distinct compatible printer IDs.');
    for (const id of ids) getPreset(id, 'machine');
    return [...ids];
  }
  function nameAvailable(name, type, id, items) {
    if (items.some(item => item.id !== id && item.type === type && item.name === name)) throw error('A custom preset with that name already exists.', 409);
    if (baseCatalog.findPresets?.(name, type).length) throw error('That name belongs to a bundled native preset.', 409);
  }
  function publicRecord(record) {
    const preset = configOf(record);
    return { id: record.id, type: record.type, name: record.name, custom: true, baseId: record.baseId, baseName: record.baseName, compatiblePrinterIds: [...record.compatiblePrinterIds], nativeCompatibility:clone(dependenciesOf(record)), nativeCompatibilityMode:record.nativeCompatibility!==undefined, nativeInheritanceMode:Boolean(record.nativeDocument), nativeParent:record.nativeParent??'', overrides: clone(record.settings), nativeVersion: '2.4.2', settings: displayedProfileSettings(record.type, preset), preset, createdAt: record.createdAt, updatedAt: record.updatedAt };
  }
  function aliasesFor(id, config) { const custom = store.get(id); return custom?.printerAliases || [config.name, config.printer_settings_id].filter(Boolean); }
  function selectionRecord(id, type) { return { id, type, config: getPreset(id, type), custom: store.get(id) }; }
  function allowed(record, printer) {
    return record.custom && record.custom.nativeCompatibility===undefined ? record.custom.compatiblePrinterIds.includes(printer.id) : compatible(record.config, printer.config, aliasesFor(printer.id, printer.config));
  }
  function baseChoicesFor(printerId, config) {
    const custom = store.get(printerId);
    if (!custom) return baseCatalog.list({ printerId });
    // Bundled choices remain eligible for a derived printer through its recorded native ancestry.
    // The snapshots are independent of future custom-base edits/deletion.
    const all = new Map();
    const defaults = baseCatalog.list();
    for (const item of [...defaults.processes.map(item => ({ ...item, scope: 'process' })), ...defaults.filaments.map(item => ({ ...item, scope: 'filament' }))]) {
      if (compatible(getPreset(item.id, item.scope), config, custom.printerAliases)) all.set(item.id, item);
    }
    for (const candidate of baseCatalog.list().printers) {
      if (!custom.printerAliases.includes(candidate.name)) continue;
      const choices = baseCatalog.list({ printerId: candidate.id });
      for (const item of [...choices.processes.map(item => ({ ...item, scope: 'process' })), ...choices.filaments.map(item => ({ ...item, scope: 'filament' }))]) all.set(item.id, item);
    }
    return { processes: [...all.values()].filter(item => item.scope === 'process'), filaments: [...all.values()].filter(item => item.scope === 'filament'), defaults: { processId: null, filamentId: null }, warnings: [], limitations: baseCatalog.list().limitations };
  }
  function preparationFor({type,baseConfig,settings,compatiblePrinterIds,sourceId,resolvedSelection,nativeCompatibility}, values) {
    const keys=new Set(['name','type','baseId','settings','compatiblePrinterIds','selection','changedSetting','mode','projectSettings','correctionBatches','acknowledgedWarnings','nativeEditor','filamentIndex','nativeCompatibility']);
    if(values.nativeEditor!==undefined&&values.nativeEditor!==true)throw error('Invalid native profile editor mode.');
    if(values.filamentIndex!==undefined&&(!Number.isInteger(values.filamentIndex)||values.filamentIndex<0||values.filamentIndex>=64))throw error('Invalid edited filament slot.');
    if(Object.keys(values).some(key=>!keys.has(key)))throw error('Unknown custom preset save field.');
    const supplied = values.selection ?? {};
    if (!plain(supplied) || Object.keys(supplied).some(key => !['printerId','processId','filamentId','filamentIds'].includes(key))) throw error('Invalid native validation selection.');
    const printerId = type === 'machine' ? sourceId : supplied.printerId || compatiblePrinterIds[0] || catalog.list().defaults.printerId;
    if (nativeCompatibility===undefined && type !== 'machine' && !compatiblePrinterIds.includes(printerId)) throw error('The validation printer must be in this preset’s compatible printer list.');
    const defaults = catalog.list({printerId}).defaults;
    const selectionIds = {printerId,processId:supplied.processId || defaults.processId,filamentId:supplied.filamentId || defaults.filamentId};
    let selection = resolvedSelection ? clone(resolvedSelection) : selectionIds.processId && selectionIds.filamentId && nativeCompatibility===undefined ? catalog.resolveSelection(selectionIds) : {printer:getPreset(printerId,'machine'),process:selectionIds.processId?getPreset(selectionIds.processId,'process'):{},filament:selectionIds.filamentId?getPreset(selectionIds.filamentId,'filament'):{}};
    const ownName = {machine:'printer',process:'process',filament:'filament'}[type];
    selection[ownName] = applyProfileOverrides(type,baseConfig,settings);
    selection.context = {...selection.context,...catalog.getSettingsContext(selection.printer),isGlobal:true,isPlate:false};
    if (values.projectSettings !== undefined) selection.context.projectSettings = normalizeNativeProjectValues(values.projectSettings);
    if (values.mode !== undefined) { if (!['Simple','Advanced','Expert'].includes(values.mode)) throw error('Unknown native editor mode.'); selection.context.mode=values.mode; }
    const filamentIds = supplied.filamentIds ?? (selectionIds.filamentId?[selectionIds.filamentId]:[]);
    if (!Array.isArray(filamentIds) || (supplied.filamentIds&&!filamentIds.length) || filamentIds.length>64 || filamentIds.some(id=>typeof id!=='string')) throw error('Invalid native filament selection.');
    if(!resolvedSelection)selection.context.filaments=filamentIds.map(id=>selectionIds.processId&&nativeCompatibility===undefined?catalog.resolveSelection({...selectionIds,filamentId:id}).filament:getPreset(id,'filament'));
    selection.context.filamentCount=Math.max(1,filamentIds.length);
    if (values.changedSetting !== undefined) {
      const change=values.changedSetting;
      if (!plain(change) || Object.keys(change).some(key=>!['key','index','previousValue'].includes(key)) || !editableDefinitionsByScope[type].some(item=>item.key===change.key) || !Object.hasOwn(settings,change.key)) throw error('Native changed-setting context must refer to an ordinary edited setting.');
      if (change.index !== undefined && (!Number.isInteger(change.index) || change.index<0 || change.index>=1024)) throw error('Invalid changed-setting index.');
      const previousValue = change.previousValue === undefined ? undefined : normalizeProfileOverrides(type,{[change.key]:change.previousValue})[change.key];
      selection.context.changedSetting={scope:type,key:change.key,...(change.index===undefined?{}:{index:change.index}),...(previousValue===undefined?{}:{previousValue})};
    }
    const batches=values.correctionBatches ?? [];
    if (!Array.isArray(batches) || batches.length>32 || batches.some(batch=>!Array.isArray(batch)) || batches.flat().length>128) throw error('Native correction batches exceed their limit.');
    const nativeChanges={};
    function accept(result) {selection=result.selection;Object.assign(nativeChanges,result.nativeChanges);}
    function automatic() {
      for(let step=0;step<16;step++){
        const plan=getNativeCorrectionPlan(selection,{scope:type});
        if(!plan.groups.some(group=>group.mode==='automatic'))return;
        accept(applyNativeCorrectionDecisions(selection,{scope:type,applyAutomatic:true}));
      }
      throw error('Native automatic corrections did not converge.');
    }
    automatic();
    for(const decisions of batches){try{accept(applyNativeCorrectionDecisions(selection,{scope:type,decisions}));}catch(failure){throw error(failure.message,/changed|no longer applicable/.test(failure.message)?409:400);}automatic();}
    const plan=getNativeCorrectionPlan(selection,{scope:type});
    const acknowledged=values.acknowledgedWarnings ?? [];
    if (!Array.isArray(acknowledged) || acknowledged.length>128 || acknowledged.some(item=>typeof item!=='string'||item.length>4096)) throw error('Invalid native warning acknowledgments.');
    plan.warnings=plan.warnings.map(item=>({...item,signature:JSON.stringify([item.scope,item.key,item.message])}));
    const unacknowledgedWarnings=plan.warnings.filter(item=>!acknowledged.includes(item.signature));
    const validation=validateNativeConfiguration(selection,{underCli:false});
    const blockingErrors=validation.errors.filter(item=>item.scope===type);
    const correctedBase=clone(baseConfig),correctedSettings=clone(settings);
    const editable=new Set(editableDefinitionsByScope[type].map(item=>item.key));
    for(const [key,value]of Object.entries(nativeChanges)){
      if(editable.has(key))correctedSettings[key]=value;
      else correctedBase[key]=clone(selection[ownName][key]);
    }
    return {baseConfig:correctedBase,settings:correctedSettings,selection,public:{type,selectionIds,context:clone(selection.context),plan,settings:clone(correctedSettings),validation,blockingErrors,unacknowledgedWarnings,ready:!plan.groups.length&&!unacknowledgedWarnings.length&&!blockingErrors.length}};
  }
  function ensurePrepared(preparation) {
    if(preparation.public.ready)return;
    const failure=error(preparation.public.blockingErrors.length?'Native preset validation failed.':'Review native settings before saving.',409);
    failure.preparation=preparation.public;throw failure;
  }
  async function nativePreparation(input,id,currentSnapshot) {
    if(!plain(input))throw error('Preset must be an object.');
    const current=currentSnapshot??(id?requireRecord(id):null),type=input.type??current?.type;
    if(!TYPES.includes(type)||(current&&current.type!==type))throw error('Preset type cannot be changed.');
    const baseId=input.baseId??current?.baseId,changeBase=!current||(input.baseId!==undefined&&input.baseId!==current.baseId),sourceId=changeBase?baseId:current.id;
    if(typeof sourceId!=='string')throw error('Choose a source preset to duplicate.');
    const nativeCompatibility=compatibilityInput(input,current,type,changeBase?getPreset(baseId,type):current.baseConfig);
    const compatiblePrinterIds=nativeCompatibility===undefined?validatePrinterIds(input.compatiblePrinterIds??current?.compatiblePrinterIds,type):idsForDependencies(type,nativeCompatibility);
    const selection={...(input.selection||{})};
    if(type!=='machine'&&!selection.printerId)selection.printerId=compatiblePrinterIds[0]||catalog.list().defaults.printerId;
    const context={catalog,nativeConfig:nativeConfiguration,type,id:sourceId,selection,projectSettings:input.projectSettings||{},filamentIndex:input.filamentIndex||0};
    const baseline=await resolveNativeProfileContext({...context,...(!changeBase?{scopeConfig:await editorBaseline(current)}:{})});
    const working=changeBase?baseline:await resolveNativeProfileContext(context);
    const existing=nativeScopeDifference(type,baseline.active,working.active);
    const edits=normalizeProfileOverrides(type,input.settings??existing);
    for(const [key,value]of Object.entries(edits))if(baseline.variantFields[key]&&(!Array.isArray(value)||value.length!==baseline.active[key].length))throw error(`Native active ${key} requires ${baseline.active[key].length} values; import full variants through native preset JSON.`);
    const changes={...edits};
    // Removing an active override resets only the selected variant; the other
    // nozzle/volume alternatives in the current complete scope remain intact.
    for(const key of Object.keys(existing))if(!Object.hasOwn(edits,key))changes[key]=clone(baseline.active[key]);
    const candidate=await resolveNativeProfileContext({...context,scopeConfig:working.full,overrides:changes});
    const activeEdits=nativeScopeDifference(type,baseline.active,candidate.active);
    for(const key of Object.keys(edits))activeEdits[key]=clone(candidate.active[key]);
    const resolvedSelection={printer:candidate.resolved.printer,process:candidate.resolved.process,filament:candidate.resolved.filaments[candidate.filamentIndex],context:candidate.context};
    // Parent-relative resets cover editable fields. Keep the working preset's
    // trusted hidden values when validating; resetting them to the parent can
    // silently undo previously acknowledged native corrections.
    const editable=new Set(editableDefinitionsByScope[type].map(item=>item.key)),validationBase=clone(baseline.active);
    for(const[key,value]of Object.entries(candidate.active))if(!editable.has(key))validationBase[key]=clone(value);
    const checked=preparationFor({type,baseConfig:validationBase,settings:activeEdits,compatiblePrinterIds,sourceId,resolvedSelection,nativeCompatibility},{...input,selection:{...candidate.selection,filamentId:candidate.selection.filamentIds[candidate.filamentIndex]}});
    if(!checked.public.ready)return{...checked,nativeContext:context};
    const fullBase=clone(baseline.full),correctedWorking=clone(candidate.full),own={machine:'printer',process:'process',filament:'filament'}[type];
    // Preserve complete inactive variants and hidden differences, then apply
    // only actual native corrections from the active projection.
    for(const[key,value]of Object.entries(candidate.full))if(!editable.has(key))fullBase[key]=clone(value);
    for(const [key,value]of Object.entries(checked.selection[own]))if(!editable.has(key)&&JSON.stringify(value)!==JSON.stringify(candidate.active[key])){fullBase[key]=clone(value);correctedWorking[key]=clone(value);}
    const corrected=await resolveNativeProfileContext({...context,scopeConfig:correctedWorking,overrides:checked.settings});
    safeConfig(fullBase);safeConfig(corrected.full);
    return{...checked,baseConfig:fullBase,settings:nativeScopeDifference(type,fullBase,corrected.full),nativeContext:context};
  }
  function nativeMetadataOnly(input,current){return Boolean(current?.nativeDocument)&&Object.keys(input).every(key=>['name','type'].includes(key));}
  function useNativePreparation(input,current,type,baseConfig){if(nativeMetadataOnly(input,current))return false;return Boolean(current?.nativeDocument)||input.nativeEditor===true||needsNativeProfileContext(type,baseConfig)||needsNativeProfileContext(type,current?configOf(current):baseConfig);}
  const catalog = {
    directory: baseCatalog.directory, getPreset,
    getPresetSource(id, type) {
      const record = store.get(id);
      if (record) { if (record.type !== type) throw error('Preset type does not match.'); return { name: record.name, vendor: 'Local custom', chain: [configOf(record)], snapshot: true, metadata:customMetadata(record) }; }
      if (baseCatalog.getPresetSource) {
        const source=clone(baseCatalog.getPresetSource(id,type)),supplied=getPreset(id,type),flat=Object.assign({},...source.chain),metadata=new Set(['name','type','from','instantiation','inherits','printer_settings_id','print_settings_id','filament_settings_id']);
        // Respect trusted configured-catalog overlays without replacing native system inheritance.
        const changes=Object.fromEntries(Object.entries(supplied).filter(([key,value])=>!metadata.has(key)&&JSON.stringify(value)!==JSON.stringify(flat[key])));
        if(Object.keys(changes).length){source.chain.push({...changes,instantiation:'true'});if(source.vendors)source.vendors.push(source.vendor);}
        if(source.metadata)source.metadata=compatibilityMetadata({...source.metadata,config:supplied,alias:source.metadata.alias});
        return source;
      }
      const config = getPreset(id, type); return { name: config.name, vendor: 'Configured catalog', chain: [config], snapshot: true };
    },
    supportsNativeCompatibility:Boolean(baseCatalog.compatibilityCandidates),
    compatibilityMetadata(id,type) { const record=store.get(id);if(record){if(record.type!==type)throw error('Preset type does not match.');return customMetadata(record);}return baseCatalog.compatibilityMetadata?.(id,type); },
    compatibilityCandidates() { return [...(baseCatalog.compatibilityCandidates?.()||[]).map(item=>({...item,metadata:compatibilityMetadata({...item.metadata,config:getPreset(item.id,item.type),alias:item.metadata.alias})})),...store.list().filter(record=>record.type!=='machine').map(record=>({id:record.id,type:record.type,summary:publicSummary(record,configOf(record)),metadata:customMetadata(record)}))]; },
    listResolved(options={}) { if(!baseCatalog.compatibilityCandidates)return Promise.resolve(catalog.list(options));return listNativeCompatiblePresets({catalog,run:(request,options)=>nativeConfiguration.run(request,options),...options}); },
    getSettingsContext(printer) { return clone(baseCatalog.getSettingsContext?.(printer) || { isBblPrinter: null, supportWrappingDetection: null, warnings: ['Native machine-model context is unavailable.'] }); },
    listMachineModels() { return clone(baseCatalog.listMachineModels?.() || []); },
    listHotendModels() { return clone(baseCatalog.listHotendModels?.() || {models:[],warnings:['Native hotend model metadata is unavailable.']}); },
    findPresets(name, type) {
      if (!TYPES.includes(type)) throw error('Unknown preset type.');
      return [...(baseCatalog.findPresets?.(name, type) || []).map(item => ({ id: item.id, config: clone(safeConfig(item.config)) })), ...store.list().filter(item => item.type === type && item.name === name).map(item => ({ id: item.id, config: configOf(item) }))];
    },
    list({ printerId } = {}) {
      const selectedId = printerId || baseCatalog.list().defaults.printerId;
      const printer = selectionRecord(selectedId, 'machine'), native = baseChoicesFor(selectedId, printer.config);
      const custom = store.list().filter(item => item.type !== 'machine' && (item.nativeCompatibility===undefined?item.compatiblePrinterIds.includes(selectedId):compatible(configOf(item),printer.config,aliasesFor(selectedId,printer.config))));
      const processes = [...native.processes, ...custom.filter(item => item.type === 'process').map(item => publicSummary(item, configOf(item)))];
      const filaments = [...native.filaments, ...custom.filter(item => item.type === 'filament').map(item => publicSummary(item, configOf(item)))];
      const preferredProcess = processes.find(item => item.name === printer.config.default_print_profile);
      const preferredFilament = filaments.find(item => strings(printer.config.default_filament_profile).includes(item.name));
      return { ...native, printers: machineChoices(), processes, filaments, defaults: { printerId: selectedId, processId: preferredProcess?.id || native.defaults.processId || processes[0]?.id || null, filamentId: preferredFilament?.id || native.defaults.filamentId || filaments[0]?.id || null }, limitations: (native.limitations || []).filter(text => !text.includes('Bundled system presets only')).concat('Native compatibility expressions are not evaluated; presets that require them are rejected.') };
    },
    resolveSelection({ printerId, processId, filamentId, overrides = {}, printerOverrides = {}, filamentOverrides = {} }) {
      const printer = selectionRecord(printerId, 'machine'), processPreset = selectionRecord(processId, 'process'), filament = selectionRecord(filamentId, 'filament');
      for (const item of [processPreset, filament]) if (!allowed(item, printer)) throw error(`${item.config.name} is incompatible with ${printer.config.name}.`);
      const result = { printer: nativeConfig(applyProfileOverrides('machine', printer.config, printerOverrides), 'machine'), process: nativeConfig(applyProfileOverrides('process', processPreset.config, overrides), 'process'), filament: nativeConfig(applyProfileOverrides('filament', filament.config, filamentOverrides), 'filament') };
      // The compatibility decision above includes the native parent of derived machines.
      // Flattened CLI profiles no longer carry that inheritance chain.
      for (const config of [result.process, result.filament]) { config.compatible_printers = [result.printer.name]; delete config.compatible_printers_condition; }
      result.context = catalog.getSettingsContext(result.printer);
      return result;
    },
    listCustom({ type } = {}) { if (type !== undefined && !TYPES.includes(type)) throw error('Unknown preset type.'); return store.list().filter(item => !type || item.type === type).map(publicRecord); },
    getCustom(id) { return publicRecord(requireRecord(id)); },
    source(id, type) { const record = store.get(id); if (record) { if (record.type !== type) throw error('Preset type does not match.'); return publicRecord(record); } const preset = getPreset(id, type); return { id, type, name: preset.name, custom: false, baseId: id, overrides: {}, nativeVersion: '2.4.2', compatiblePrinterIds: type === 'machine' ? [] : machineChoices().filter(item => compatible(preset, getPreset(item.id, 'machine'), aliasesFor(item.id, getPreset(item.id, 'machine')))).map(item => item.id), settings: displayedProfileSettings(type, preset), nativeCompatibility:nativeCompatibilityFromConfig(type,preset),nativeCompatibilityMode:true, preset }; },
    prepareCustom(input, id) {
      if(!plain(input))throw error('Preset must be an object.');
      const current=id?requireRecord(id):null,type=input.type??current?.type;
      if(!TYPES.includes(type)||(current&&current.type!==type))throw error('Preset type cannot be changed.');
      const baseId=input.baseId??current?.baseId;
      const changeBase=!current||(input.baseId!==undefined&&input.baseId!==current.baseId);
      if(changeBase&&typeof baseId!=='string')throw error('Choose a source preset to duplicate.');
      const metadataOnly=nativeMetadataOnly(input,current),baseConfig=changeBase?getPreset(baseId,type):metadataOnly?configOf(current):current.baseConfig;
      const settings=normalizeProfileOverrides(type,metadataOnly?{}:input.settings??(changeBase?{}:current.settings));
      const nativeCompatibility=compatibilityInput(input,current,type,changeBase?getPreset(baseId,type):current.baseConfig);
    const compatiblePrinterIds=nativeCompatibility===undefined?validatePrinterIds(input.compatiblePrinterIds??current?.compatiblePrinterIds,type):idsForDependencies(type,nativeCompatibility);
      return preparationFor({type,baseConfig,settings,compatiblePrinterIds,sourceId:changeBase?baseId:current.id,nativeCompatibility},input).public;
    },
    async sourceContext(id,type,input={},{signal}={}) {
      if(!plain(input)||Object.keys(input).some(key=>!['selection','projectSettings','filamentIndex'].includes(key)))throw error('Invalid native profile context.');
      const record=store.get(id),resolved=await resolveNativeProfileContext({catalog,nativeConfig:nativeConfiguration,type,id,...input,signal});
      const baseline=record?await resolveNativeProfileContext({catalog,nativeConfig:nativeConfiguration,type,id,...input,scopeConfig:await editorBaseline(record),signal}):resolved;
      return{...resolved.source,compatibilityOptions:dependencyOptions(type,resolved.selection.printerId),compatibilityResults:resolved.resolved.compatibility,preset:resolved.active,settings:resolved.settings,baseSettings:displayedProfileSettings(type,baseline.active),overrides:nativeScopeDifference(type,baseline.active,resolved.active),nativeEditor:true,variantFields:resolved.variantFields,relatedSettings:resolved.relatedSettings,context:resolved.context,editorContext:{selection:resolved.selection,projectSettings:resolved.projectSettings,filamentIndex:resolved.filamentIndex,nozzleCount:resolved.nozzles,nozzleVolumeTypes:resolved.editorNozzles.map(nozzle=>nozzle.nozzleVolume),extruderTypes:resolved.editorNozzles.map(nozzle=>nozzle.extruderType),filamentMap:resolved.resolved.effectiveSettings.filament_map,nozzles:resolved.editorNozzles,slicingDifferences:resolved.slicingDifferences}};
    },
    async prepareCustomResolved(input,id) {
      const current=id?requireRecord(id):null,type=input?.type??current?.type,baseId=input?.baseId??current?.baseId,baseConfig=(!current||(input?.baseId!==undefined&&input.baseId!==current.baseId))?getPreset(baseId,type):current.baseConfig;
      return useNativePreparation(input,current,type,baseConfig)?(await nativePreparation(input,id,current)).public:catalog.prepareCustom(input,id);
    },
    async close(){await nativeConfiguration.close();},
    async saveCustom(input, id) {
      if (!plain(input)) throw error('Preset must be an object.');
      const values = clone(input);
      return store.mutate(async items => {
        const current = id ? items.find(item => item.id === id) : null;
        if (id && !current) throw error('Custom preset not found.', 404);
        const type = values.type ?? current?.type;
        if (!TYPES.includes(type) || (current && current.type !== type)) throw error('Preset type cannot be changed.');
        const nativeMode=Boolean(current?.nativeDocument)||values.nativeEditor===true||Boolean(store.get(values.baseId)?.nativeDocument);
        const name = nativeMode?validNativeName(values.name ?? current?.name):validName(values.name ?? current?.name);
        if(current&&name!==current.name&&items.some(item=>item.id!==id&&item.type===type&&item.nativeDocument&&item.nativeParent===current.name))throw error('This native preset has children. Keep its parent name until they are explicitly moved to another parent.',409);
        nameAvailable(name, type, id, items);
        const baseId = values.baseId ?? current?.baseId;
        if ((!current && typeof baseId !== 'string') || (values.baseId !== undefined && values.baseId !== current?.baseId && typeof values.baseId !== 'string') || (id && baseId === id)) throw error('Choose a source preset to duplicate.');
        const changeBase = !current || (values.baseId !== undefined && values.baseId !== current.baseId);
        const metadataOnly=nativeMetadataOnly(values,current);
        let baseConfig = changeBase ? getPreset(baseId, type) : metadataOnly ? configOf(current) : current.baseConfig;
        let settings = normalizeProfileOverrides(type, metadataOnly ? {} : values.settings ?? (changeBase ? {} : current.settings));
        let nativeCompatibility=compatibilityInput(values,current,type,baseConfig);
        const compatiblePrinterIds=nativeCompatibility===undefined?validatePrinterIds(values.compatiblePrinterIds??current?.compatiblePrinterIds,type):idsForDependencies(type,nativeCompatibility);
        const preparation=useNativePreparation(values,current,type,baseConfig)?await nativePreparation(values,id,current):preparationFor({type,baseConfig,settings,compatiblePrinterIds,sourceId:changeBase?baseId:current.id,nativeCompatibility},values);
        ensurePrepared(preparation);baseConfig=preparation.baseConfig;settings=preparation.settings;
        // Tab.cpp:6706: the first system-derived filament save acquires the selected base printer, even with an empty dependency list.
        if(!current && type==='filament' && !store.get(baseId) && nativeCompatibility && !nativeCompatibility.compatible_printers.length){const selected=preparation.public.selectionIds.printerId;nativeCompatibility={...nativeCompatibility,compatible_printers:[basePrinterName(selected)]};}
        let record = { id: id || `custom-${type}-${crypto.randomUUID()}`, type, name, baseId, baseName: changeBase ? baseConfig.name : current.baseName, nativeParent:changeBase?savedParent(baseId,type):(current.nativeParent??current.baseName??''), baseConfig: clone(baseConfig), settings, compatiblePrinterIds:nativeCompatibility===undefined?compatiblePrinterIds:idsForDependencies(type,nativeCompatibility),...(nativeCompatibility===undefined?{}:{nativeCompatibility}), printerAliases: type === 'machine' ? [...new Set([...(changeBase ? aliasesFor(baseId, baseConfig) : current.printerAliases), baseConfig.name])] : [], createdAt: current?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
        if(nativeMode){
          const parent=await resolvedParent(record.nativeParent,type,items);
          const complete={...nativeConfigurationScope(type,applyProfileOverrides(type,baseConfig,settings),name),...dependenciesOf(record),version:current?.nativeFullSettings?.version??'2.4.2',...(current?.nativeFullSettings?.filament_id?{filament_id:current.nativeFullSettings.filament_id}:{})};
          const projection=await projectNativeUserPreset({type,mode:'save',name,settings:complete,parent},{nativeConfig:nativeConfiguration});
          record=retainNativeProjection(record,projection,parent);
        }
        safeConfig(configOf(record));
        let next=[...items.filter(item => item.id !== id),record];
        if(current&&record.nativeDocument)next=await reloadNativeChildren(next,record);
        return { items:next, result: publicRecord(record) };
      });
    },
    async deleteCustom(id) {
      return store.mutate(items => {
        const current = items.find(item => item.id === id); if (!current) throw error('Custom preset not found.', 404);
        if(items.some(item=>item.id!==id&&item.type===current.type&&item.nativeDocument&&item.nativeParent===current.name))throw error('This native preset is inherited by another preset. Remove its children first.',409);
        if (items.some(item => item.compatiblePrinterIds.includes(id))) throw error('This printer is used by custom process or filament presets. Update their compatibility before deleting it.', 409);
        return { items: items.filter(item => item.id !== id) };
      });
    },
    exportPreset(id, type) {
      const current = store.get(id), config = current ? configOf(current) : getPreset(id, type);
      const scope = current?.type || type;
      if (current && type && current.type !== type) throw error('Preset type does not match.');
      if(current?.nativeDocument)return clone(current.nativeDocument);
      const output = nativeConfig(config, scope, config.name, 'user');
      if (current) Object.assign(output,dependenciesOf(current));
      return output;
    },
    async importPreset(input) {
      if (!plain(input) || !plain(input.preset)) throw error('Import a native preset JSON object.');
      const values = clone(input), document = values.preset;
      return store.mutate(async items => {
        const type = document.type;
        if (!TYPES.includes(type)) throw error('Native preset type must be machine, process, or filament.');
        const name = validName(document.name); nameAvailable(name, type, undefined, items);
        const suppliedDependencies=normalizeNativeCompatibility(type,Object.fromEntries(Object.entries(document).filter(([key])=>key.startsWith('compatible_'))),{partial:true});
        if(values.compatiblePrinterIds!==undefined&&Object.keys(suppliedDependencies).length)throw error('Native JSON dependencies cannot be combined with compatible printer IDs.');
        if(document.inherits!==undefined&&typeof document.inherits!=='string')throw error('Native preset JSON requires one inheritance name.');
        const parents = document.inherits ? [document.inherits] : [];
        if (parents.some(parent => typeof parent !== 'string' || !parent.trim())) throw error('Native inheritance must contain preset names.');
        const sources = [];
        for (const parent of parents) {
          const matches = [...items.filter(item => item.type === type && item.name === parent).map(item => ({ id: item.id, config: configOf(item) })), ...(baseCatalog.findPresets?.(parent, type) || [])];
          if (matches.length !== 1) throw error(`${matches.length ? 'Ambiguous' : 'Unknown'} inherited ${type} preset: ${parent}`);
          sources.push(matches[0]);
        }
        if (values.baseId) {
          const base = getPreset(values.baseId, type);
          if (sources.length && !sources.some(source => source.id === values.baseId)) throw error('Selected source preset does not match native inheritance.');
          if (!sources.length) sources.push({ id: values.baseId, config: base });
        }
        const normalized=normalizeUserPresetValues(type,document);
        // Legacy web imports may choose a source explicitly. Native imports use
        // their exact single inheritance name; never merge unrelated scopes.
        if(!parents.length&&values.baseId)normalized.inherits=sources[0].config.name;
        if(values.compatiblePrinterIds!==undefined){const ids=validatePrinterIds(values.compatiblePrinterIds,type);normalized.compatible_printers=ids.map(id=>getPreset(id,'machine').name);}
        const nativeParent=normalized.inherits||'',parent=await resolvedParent(nativeParent,type,items);
        const projection=await projectNativeUserPreset({type,mode:'load',name,document:normalized,parent},{nativeConfig:nativeConfiguration});
        const config=projection.nativeFullSettings,nativeCompatibility=nativeCompatibilityFromConfig(type,config),compatiblePrinterIds=idsForDependencies(type,nativeCompatibility);
        safeConfig(config);
        const importedSelection={printer:type==='machine'?config:getPreset(compatiblePrinterIds[0]||catalog.list().defaults.printerId,'machine'),process:type==='process'?config:{},filament:type==='filament'?config:{}};
        const importedErrors=validateNativeConfiguration(importedSelection,{underCli:false}).errors.filter(item=>item.scope===type);
        if(importedErrors.length)throw error(`Native preset validation failed: ${importedErrors.map(item=>`${item.key}: ${item.message}`).join(' ')}`);
        const record = { id: `custom-${type}-${crypto.randomUUID()}`, type, name, baseId: sources[0]?.id || null, baseName: sources[0]?.config.name || null, nativeParent, nativeDocument:{version:'2.4.2',...normalized,name,type,from:normalized.from??'user'},nativeFullSettings:config,baseConfig:parent?.settings??config,settings:nativeScopeDifference(type,parent?.settings??config,config), nativeCompatibility,compatiblePrinterIds, printerAliases: type === 'machine' ? [...new Set(sources.flatMap(source => aliasesFor(source.id, source.config)))] : [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        return { items: [...items, record], result: publicRecord(record) };
      });
    }
  };
  if(store.items.some(item=>item.nativeDocument)){
    const pending=new Map(store.list().map(item=>[item.id,item])),loaded=new Map(),loading=new Set();
    async function loadRecord(record){
      if(loaded.has(record.id))return loaded.get(record.id);
      if(loading.has(record.id))throw error('Cyclic native user preset inheritance.');loading.add(record.id);
      if(!record.nativeDocument){loaded.set(record.id,record);loading.delete(record.id);return record;}
      const match=parentMatch(record.nativeParent,record.type,[...pending.values()]);
      if(match?.record){const parent=await loadRecord(match.record);pending.set(parent.id,parent);}
      const parent=await resolvedParent(record.nativeParent,record.type,[...pending.values()]);
      const projection=await projectNativeUserPreset({type:record.type,mode:'load',name:record.name,document:record.nativeDocument,parent},{nativeConfig:nativeConfiguration});
      const value=retainNativeProjection(record,projection,parent);loaded.set(record.id,value);loading.delete(record.id);return value;
    }
    const restored=[];for(const record of store.list())restored.push(await loadRecord(record));store.items=restored;
  }
  return catalog;
}

export function createCustomPresetRouter({ catalog }) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin')) {
      let valid = false; try { valid = new URL(req.get('origin')).origin === new URL(`${req.protocol}://${req.get('host')}`).origin; } catch { /* Reject malformed origins. */ }
      if (!valid) return res.status(403).json({ error: 'Cross-origin preset changes are not allowed.' });
    }
    next();
  });
  const route = handler => async (req, res) => { try { await handler(req, res); } catch (failure) { res.status(failure.status || (failure.code ? 500 : 400)).json({ error: failure.code ? 'Could not persist the custom preset.' : failure.message, ...(failure.preparation?{preparation:failure.preparation}:{}) }); } };
  router.get('/', route((req, res) => res.json(catalog.listCustom({ type: req.query.type }))));
  router.get('/source/:type/:id/export', route((req, res) => res.json(catalog.exportPreset(req.params.id, req.params.type))));
  router.get('/source/:type/:id', route((req, res) => res.json(catalog.source(req.params.id, req.params.type))));
  router.post('/source/:type/:id/context',route(async(req,res)=>{
    const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};req.once('aborted',abort);res.once('close',abort);
    try{const result=await catalog.sourceContext(req.params.id,req.params.type,req.body,{signal:controller.signal});if(!res.destroyed)res.json(result);}finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}
  }));
  router.post('/prepare', route(async(req,res)=>res.json(await catalog.prepareCustomResolved(req.body))));
  router.post('/:id/prepare', route(async(req,res)=>res.json(await catalog.prepareCustomResolved(req.body,req.params.id))));
  router.post('/import', route(async (req, res) => res.status(201).json(await catalog.importPreset(req.body))));
  router.post('/', route(async (req, res) => res.status(201).json(await catalog.saveCustom(req.body))));
  router.get('/:id/export', route((req, res) => res.json(catalog.exportPreset(req.params.id))));
  router.get('/:id', route((req, res) => res.json(catalog.getCustom(req.params.id))));
  router.put('/:id', route(async (req, res) => res.json(await catalog.saveCustom(req.body, req.params.id))));
  router.delete('/:id', route(async (req, res) => { await catalog.deleteCustom(req.params.id); res.status(204).end(); }));
  return router;
}
