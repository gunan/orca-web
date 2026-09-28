import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject } from '../../shared/project.js';
import { embeddedProjectSelection, nativeProjectRequest, needsNativeProjectPipeline } from '../../shared/native-project-client.js';
const settings = { printable_area: ['-10x-5','210x-5','210x195','-10x195'], printable_height: '250', nozzle_diameter: ['0.4'], layer_height: '0.16', printer_settings_id: 'Embedded printer', print_settings_id: 'Embedded process', filament_settings_id: ['PLA','PETG'], filament_diameter: ['1.75','1.75'] };
test('embedded native settings drive bed dimensions and process values independently of catalog matches', () => {
  const project = { ...emptyProject(), useEmbeddedSettings: true, nativeSettings: settings };
  const selection = embeddedProjectSelection(project);
  assert.equal(selection.settings.layer_height, '0.16'); assert.equal(selection.printer.bedSize, '220 × 200 mm'); assert.equal(selection.printer.bedHeight, 250); assert.equal(selection.process.name, 'Embedded process');
  assert.equal(embeddedProjectSelection({ ...project, useEmbeddedSettings: false }), null);
  assert.equal(embeddedProjectSelection({ ...project, nativeSettings: { printable_area: ['bad'] } }), null);
});
test('embedded slicing merges current process edits into a snapshot without mixing catalog overrides', () => {
  const project = { ...emptyProject(), useEmbeddedSettings: true, nativeSettings: settings, overrides: { layer_height: 0.12 } };
  const request = nativeProjectRequest(project);
  assert.equal(request.project.nativeSettings.layer_height, '0.12'); assert.deepEqual(request.project.overrides, {}); assert.equal(request.overrides, undefined); assert.equal(request.selection, undefined);
  assert.equal(project.nativeSettings.layer_height, '0.16'); assert.equal(project.overrides.layer_height, 0.12);
});
test('catalog native export carries ordered filament slots and validated process edits', () => {
  const project = { ...emptyProject(), ids: { printerId: 'p', processId: 's', filamentId: 'red' }, filamentIds: ['red','blue'], overrides: { sparse_infill_density: '35%' } };
  const request = nativeProjectRequest(project, { allPlates: true });
  assert.deepEqual(request.selection.filamentIds, ['red','blue']); assert.equal(request.overrides.process.sparse_infill_density, '35%'); assert.equal(request.allPlates, true); assert.equal(needsNativeProjectPipeline(project), true);
  assert.equal(needsNativeProjectPipeline(emptyProject()), false);
});

test('native request preserves source snapshots and forwards process decisions without accepting arbitrary hidden edits',()=>{
 const decisions=[{id:'process:spiral-mode',signature:'reviewed',choice:'apply'}];
 const project={...emptyProject(),useEmbeddedSettings:true,nativeSettings:{...settings,enforce_support_layers:'7'},overrides:{wall_loops:1},processCorrectionDecisions:decisions};
 const selected=embeddedProjectSelection(project);assert.equal(selected.nativeProcessSettings.enforce_support_layers,'7');assert.equal(selected.settings.enforce_support_layers,undefined);
 selected.nativeProcessSettings.enforce_support_layers='9';assert.equal(project.nativeSettings.enforce_support_layers,'7');
 const request=nativeProjectRequest(project);assert.deepEqual(request.processCorrectionDecisions,decisions);assert.equal(request.project.nativeSettings.enforce_support_layers,'7');
 request.processCorrectionDecisions[0].signature='changed';assert.equal(decisions[0].signature,'reviewed');
 assert.throws(()=>nativeProjectRequest({...project,overrides:{enforce_support_layers:999}}),/Unsupported process setting/);
});
