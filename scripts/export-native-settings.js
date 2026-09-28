#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { settingDefinitions, settingGroups } from '../shared/settings.js';
import { editableDefinitionsByScope } from '../shared/profile-settings.js';

const CATEGORIES = ['machine', 'process', 'filament'];
export const METADATA_KEYS = new Set(['type', 'name', 'from', 'instantiation', 'inherits', 'setting_id', 'filament_id', 'version', 'description', 'printer_settings_id', 'print_settings_id', 'filament_settings_id', 'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition', 'created_time', 'updated_time', 'user_id', 'base_id']);
const scriptPath = fileURLToPath(import.meta.url);
const groupByKey = new Map(Object.entries(settingGroups).flatMap(([group, definitions]) => definitions.map(definition => [definition.key, group])));
const featureByGroup = { Quality: 'settings.quality', Strength: 'settings.strength', Speed: 'settings.speed', Support: 'settings.support', Others: 'settings.others', Multimaterial: 'multimaterial.category' };
const valueType = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

export async function readObservedSettings({ profilesDir, nativeVersion, definitions = settingDefinitions, definitionsByCategory = { ...editableDefinitionsByScope, process: definitions } }) {
  if (!profilesDir || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(nativeVersion || '')) throw new Error('profilesDir and an explicit nativeVersion (for example 2.4.2) are required.');
  const root = path.resolve(profilesDir), records = new Map(), warnings = [];
  const editableByCategory = Object.fromEntries(CATEGORIES.map(category => [category, new Set((definitionsByCategory[category] || []).map(definition => definition.key))]));
  const editable = editableByCategory.process;
  const profileCounts = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  let jsonFilesRead = 0, ignoredNonSystem = 0, ignoredOtherTypes = 0;
  async function visit(directory) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(filename); continue; }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
      jsonFilesRead++;
      const relative = path.relative(root, filename).split(path.sep).join('/');
      let data;
      try { data = JSON.parse(await readFile(filename, 'utf8')); }
      catch (error) { warnings.push({ file: relative, reason: error instanceof SyntaxError ? 'Invalid JSON.' : `Cannot read file (${error.code || 'unknown error'}).` }); continue; }
      if (!data || typeof data !== 'object' || Array.isArray(data)) { warnings.push({ file: relative, reason: 'Profile root must be an object.' }); continue; }
      if (!CATEGORIES.includes(data.type)) { ignoredOtherTypes++; continue; }
      if (data.from && data.from !== 'system') { ignoredNonSystem++; continue; }
      profileCounts[data.type]++;
      for (const [key, value] of Object.entries(data)) {
        if (METADATA_KEYS.has(key)) continue;
        const id = `${data.type}:${key}`;
        if (!records.has(id)) records.set(id, { category: data.type, key, valueTypes: new Set(), profilesDeclaring: 0 });
        const record = records.get(id);
        record.valueTypes.add(valueType(value));
        record.profilesDeclaring++;
      }
    }
  }
  await visit(root);
  const settings = [...records.values()].sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.key.localeCompare(b.key)).map(record => {
    const webEditable = editableByCategory[record.category].has(record.key);
    const webGroup = !webEditable ? null : record.category === 'process' ? groupByKey.get(record.key) || null : definitionsByCategory[record.category].find(option => option.key === record.key)?.ui?.page || null;
    return { ...record, valueTypes: [...record.valueTypes].sort(), webEditable, webGroup,
      status: webEditable ? 'web-editable-partial' : 'native-preset-pass-through',
      featureId: record.category === 'machine' ? 'settings.printer' : record.category === 'filament' ? 'settings.filament' : featureByGroup[webGroup] || 'settings.process',
      testRefs: !webEditable ? [] : record.category === 'process' ? ['tests/unit/settings.test.js', 'tests/unit/presets.test.js'] : ['tests/unit/profile-settings.test.js', 'tests/e2e/profile-editor.spec.js'] };
  });
  return {
    schemaVersion: 1, nativeVersion,
    profileSource: { kind: 'bundled-system-profiles', directory: root, versionEvidence: 'Explicit --native-version argument; this scanner does not execute the binary.' },
    scopeNote: 'Observed keys declared directly in bundled machine/process/filament JSON files, including abstract parent presets. This is not the complete native UI schema: undeclared defaults, GUI-only options, inherited effective counts, enum ranges and dependencies are not discovered. No preset values or account/user preset data are exported. Native-preset-pass-through means keys are retained when a supported compatible preset is resolved; it does not prove all profiles or keys work. webEditable maps each key to browser controls in its own machine/process/filament scope; a same-named key in another scope does not count. Control coverage does not establish native dependency or UI parity. webControlsNotObserved is the legacy process-only list; webControlsNotObservedByCategory covers every scope. Test references are related coverage locations, not test execution evidence.',
    excludedMetadataKeys: [...METADATA_KEYS].sort(),
    counts: { jsonFilesRead, profiles: profileCounts, ignoredNonSystem, ignoredOtherTypes, observedKeys: settings.length, byCategory: Object.fromEntries(CATEGORIES.map(category => [category, settings.filter(record => record.category === category).length])), webEditableObserved: settings.filter(record => record.webEditable).length, browserControlDefinitions: Object.values(editableByCategory).reduce((total, keys) => total + keys.size, 0), browserControlDefinitionsByCategory: Object.fromEntries(CATEGORIES.map(category => [category, editableByCategory[category].size])), webEditableObservedByCategory: Object.fromEntries(CATEGORIES.map(category => [category, settings.filter(record => record.category === category && record.webEditable).length])) },
    webControlsNotObserved: [...editable].filter(key => !records.has(`process:${key}`)).sort(),
    webControlsNotObservedByCategory: Object.fromEntries(CATEGORIES.map(category => [category, [...editableByCategory[category]].filter(key => !records.has(`${category}:${key}`)).sort()])),
    warnings, settings
  };
}

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
export function renderCSV(inventory) {
  const rows = [['native_version', 'category', 'key', 'observed_value_types', 'profiles_declaring', 'web_editable', 'web_group', 'status', 'feature_id', 'related_test_refs']];
  for (const record of inventory.settings) rows.push([inventory.nativeVersion, record.category, record.key, record.valueTypes.join('; '), record.profilesDeclaring, record.webEditable, record.webGroup, record.status, record.featureId, record.testRefs.join('; ')]);
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

async function main(args) {
  const options = { rootDir: path.resolve(path.dirname(scriptPath), '..') };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--write') { options.write = true; continue; }
    const key = { '--profiles-dir': 'profilesDir', '--native-version': 'nativeVersion', '--root': 'rootDir' }[argument];
    if (!key || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Usage: node scripts/export-native-settings.js --profiles-dir PATH --native-version VERSION [--root PATH] [--write]');
    options[key] = args[++index];
  }
  const inventory = await readObservedSettings(options);
  if (options.write) {
    const directory = path.resolve(options.rootDir, 'docs/parity');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'native-settings.json'), JSON.stringify(inventory, null, 2) + '\n');
    await writeFile(path.join(directory, 'native-settings.csv'), renderCSV(inventory));
  }
  process.stdout.write(JSON.stringify({ ...inventory.counts, warnings: inventory.warnings.length, webControlsNotObserved: inventory.webControlsNotObserved, written: Boolean(options.write) }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) main(process.argv.slice(2)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
