import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readObservedSettings, renderCSV } from '../../scripts/export-native-settings.js';

async function fixture(t, files) {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-setting-keys-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const filename = path.join(directory, name);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return directory;
}

test('unions declared keys and value types without mixing machine/process keys or exporting values', async t => {
  const profilesDir = await fixture(t, {
    'vendor/process/base.json': { type: 'process', from: 'system', layer_height: 'PRIVATE-VALUE', shared_key: 1 },
    'vendor/process/child.json': { type: 'process', from: 'system', inherits: 'base', layer_height: ['0.2'], shared_key: true },
    'vendor/machine/printer.json': { type: 'machine', from: 'system', layer_height: '0.3', shared_key: null, nozzle_diameter: ['0.4'] },
    'vendor/filament/material.json': { type: 'filament', from: 'system', temperature: ['220'], nozzle_temperature: ['220'] },
  });
  const inventory = await readObservedSettings({ profilesDir, nativeVersion: '2.4.2' });
  const process = inventory.settings.find(record => record.category === 'process' && record.key === 'layer_height');
  const machine = inventory.settings.find(record => record.category === 'machine' && record.key === 'layer_height');
  assert.equal(process.profilesDeclaring, 2);
  assert.deepEqual(process.valueTypes, ['array', 'string']);
  assert.equal(process.webEditable, true);
  assert.equal(process.featureId, 'settings.quality');
  assert.equal(machine.webEditable, false);
  assert.equal(machine.profilesDeclaring, 1);
  assert.equal(inventory.counts.observedKeys, 7);
  assert.equal(inventory.counts.browserControlDefinitions, 569);
  assert.equal(inventory.counts.webEditableObserved, 3);
  assert.deepEqual(inventory.counts.browserControlDefinitionsByCategory, { machine: 115, process: 342, filament: 112 });
  assert.deepEqual(inventory.counts.webEditableObservedByCategory, { machine: 1, process: 1, filament: 1 });
  assert.ok(!inventory.webControlsNotObservedByCategory.machine.includes('nozzle_diameter'));
  assert.ok(!inventory.webControlsNotObservedByCategory.filament.includes('nozzle_temperature'));
  assert.ok(inventory.webControlsNotObserved.includes('wall_loops'));
  assert.ok(!JSON.stringify(inventory).includes('PRIVATE-VALUE'));
});

test('excludes metadata and user presets, warns on malformed JSON, and keeps scanning', async t => {
  const profilesDir = await fixture(t, {
    'process.json': { type: 'process', from: 'system', name: 'base', inherits: 'parent', instantiation: 'false', setting_id: 'id', compatible_printers: ['x'], version: '2', wall_loops: '3' },
    'user.json': { type: 'process', from: 'user', personal_key: 'DO-NOT-EXPORT' },
    'manifest.json': { name: 'vendor', machine_list: [] },
    'broken.json': '{"secret":"DO-NOT-EXPORT"',
    'array.json': [],
  });
  const inventory = await readObservedSettings({ profilesDir, nativeVersion: '2.4.2' });
  assert.deepEqual(inventory.settings.map(record => record.key), ['wall_loops']);
  assert.equal(inventory.counts.profiles.process, 1);
  assert.equal(inventory.counts.ignoredNonSystem, 1);
  assert.equal(inventory.counts.ignoredOtherTypes, 1);
  assert.equal(inventory.warnings.length, 2);
  assert.ok(!JSON.stringify(inventory).includes('DO-NOT-EXPORT'));
});

test('CSV quotes keys correctly and exports a stable order without adding unseen GUI options', async t => {
  const profilesDir = await fixture(t, {
    'z.json': { type: 'filament', 'comma,"quoted': ['test'] },
    'a.json': { type: 'process', zebra: 'z', alpha: 'a' },
  });
  const inventory = await readObservedSettings({ profilesDir, nativeVersion: '2.4.2', definitions: [{ key: 'not_in_presets' }] });
  assert.deepEqual(inventory.settings.map(record => `${record.category}:${record.key}`), ['process:alpha', 'process:zebra', 'filament:comma,"quoted']);
  assert.deepEqual(inventory.webControlsNotObserved, ['not_in_presets']);
  assert.equal(inventory.settings.every(record => !record.webEditable), true);
  assert.match(renderCSV(inventory), /"comma,""quoted"/);
  assert.equal(renderCSV(inventory), renderCSV(inventory));
  await assert.rejects(readObservedSettings({ profilesDir }), /explicit nativeVersion/);
});
