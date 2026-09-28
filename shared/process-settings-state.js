import { evaluateSettingsState } from './settings-dependencies.js';
import { normalizeOverrides } from './settings.js';
import { editableDefinitionsByScope, normalizeNativeProfileValues } from './profile-settings.js';
import { getNativeCorrectionPlan, applyNativeCorrectionDecisions } from './native-setting-corrections.js';

const editable = new Set(editableDefinitionsByScope.process.map(item => item.key));
const canonical = (key,value) => JSON.stringify(normalizeNativeProfileValues('process',{[key]:value})[key]);

export function processSettingsSelection(resolved, overrides, { filamentCount = 1, projectSettings = {}, processCorrectionDecisions = [], ...context } = {}) {
  const selection = { printer: resolved?.printerSettings || {}, process: { ...resolved?.settings, ...resolved?.nativeProcessSettings, ...overrides }, filament: resolved?.filamentSettings || {}, context: { ...resolved?.context, ...context, isGlobal: true, isPlate: false, filamentCount, projectSettings } };
  if (Array.isArray(processCorrectionDecisions) && !processCorrectionDecisions.length) return selection;
  return applyNativeCorrectionDecisions(selection, {scope:'process',decisions:processCorrectionDecisions}).selection;
}

export function processSettingsState(resolved, overrides, context) {
  const selection = processSettingsSelection(resolved, overrides, context);
  return { ...evaluateSettingsState(selection), correctionPlan: getNativeCorrectionPlan(selection,{scope:'process'}) };
}

// Apply reviewed visible changes as ordinary edits. Only remaining source-derived
// hidden changes retain signed decisions, recomputed against those visible edits.
export function acceptProcessCorrectionChoices(resolved, overrides, decisions, context = {}) {
  const original = processSettingsSelection(resolved,overrides,{...context,processCorrectionDecisions:[]});
  const previous = applyNativeCorrectionDecisions(original,{scope:'process',decisions:context.processCorrectionDecisions || []});
  const accepted = applyNativeCorrectionDecisions(previous.selection,{scope:'process',decisions});
  const changes = {...previous.nativeChanges,...accepted.nativeChanges};
  const visible = Object.fromEntries(Object.entries(changes).filter(([key])=>editable.has(key)));
  const nextOverrides = {...overrides,...normalizeOverrides(visible)};
  const current = processSettingsSelection(resolved,nextOverrides,{...context,processCorrectionDecisions:[]});
  const acceptedIds = new Set([...previous.applied,...accepted.applied].map(item=>item.id));
  const remainingDecisions = getNativeCorrectionPlan(current,{scope:'process'}).groups.filter(group=>acceptedIds.has(group.id) && group.changes.length && group.changes.every(change=>!editable.has(change.key) && Object.hasOwn(changes,change.key) && canonical(change.key,change.value)===canonical(change.key,changes[change.key]))).map(group=>({id:group.id,choice:'apply',signature:group.signature}));
  const result = applyNativeCorrectionDecisions(current,{scope:'process',decisions:remainingDecisions});
  return {overrides:nextOverrides,processCorrectionDecisions:remainingDecisions,selection:result.selection,remaining:result.remaining};
}
export function applyAutomaticProcessCorrections(resolved, overrides, context) {
  let result = { ...overrides };
  for (let i=0;i<8;i++) {
    const changes = processSettingsState(resolved,result,context).corrections.filter(item=>item.scope==='process'&&item.mode==='automatic');
    if (!changes.length) return result;
    const patch = normalizeOverrides(Object.fromEntries(changes.map(item=>[item.key,item.value])));
    const next = { ...result, ...patch };
    if (JSON.stringify(next) === JSON.stringify(result)) return result;
    result = next;
  }
  throw new Error('Native setting dependencies could not be resolved.');
}
