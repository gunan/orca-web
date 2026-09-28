import test from 'node:test';
import assert from 'node:assert/strict';
import { displayedSettings } from '../../shared/settings.js';
import { displayedProfileSettings } from '../../shared/profile-settings.js';
import { processSettingsState, processSettingsSelection, acceptProcessCorrectionChoices, applyAutomaticProcessCorrections } from '../../shared/process-settings-state.js';
import { applyNativeCorrectionDecisions } from '../../shared/native-setting-corrections.js';
import { normalizeOverrides } from '../../shared/settings.js';
const resolved={settings:displayedSettings({}),printerSettings:displayedProfileSettings('machine',{}),filamentSettings:displayedProfileSettings('filament',{}),context:{isBblPrinter:false,supportWrappingDetection:false}};
test('automatic native adjustments resolve dependent options without accepting confirmation choices',()=>{
 const overrides={max_volumetric_extrusion_rate_slope:5,enable_arc_fitting:true,spiral_mode:true};
 const changed=applyAutomaticProcessCorrections(resolved,overrides,{filamentCount:1});
 assert.equal(changed.enable_arc_fitting,'0');assert.equal(changed.spiral_mode,true);assert.equal(changed.wall_loops,undefined);assert.equal(overrides.enable_arc_fitting,true);
 const state=processSettingsState(resolved,changed);assert.ok(state.corrections.some(item=>item.group==='spiral-mode'&&item.mode==='confirmation'));
});
test('native capabilities and filament count affect process constraints independently of UI search',()=>{
 const state=processSettingsState(resolved,{enable_wrapping_detection:true,support_filament:5,enable_support:true},{filamentCount:2});
 assert.equal(state.fields.process.support_type.enabled,true);assert.ok(state.corrections.some(item=>item.key==='enable_wrapping_detection'&&item.value===false));assert.ok(state.corrections.some(item=>item.key==='support_filament'));
});

test('accepted vase choices materialize visible edits and retain exact hidden native decisions for submission',()=>{
 const selection={...resolved,nativeProcessSettings:{enforce_support_layers:'7'}},overrides={spiral_mode:true};
 const original=structuredClone(selection),plan=processSettingsState(selection,overrides).correctionPlan;
 const group=plan.groups.find(item=>item.id==='process:spiral-mode');assert.ok(group.changes.some(item=>item.key==='enforce_support_layers'));
 const accepted=acceptProcessCorrectionChoices(selection,overrides,[{id:group.id,signature:group.signature,choice:'apply'}]);
 assert.equal(accepted.overrides.wall_loops,'1');assert.equal(accepted.overrides.enforce_support_layers,undefined);assert.doesNotThrow(()=>normalizeOverrides(accepted.overrides));
 assert.equal(accepted.processCorrectionDecisions.length,1);assert.notEqual(accepted.processCorrectionDecisions[0].signature,group.signature);
 assert.equal(accepted.selection.process.enforce_support_layers,'0');assert.ok(!accepted.remaining.groups.some(item=>item.id==='process:spiral-mode'));
 const trusted=processSettingsSelection(selection,accepted.overrides,{processCorrectionDecisions:accepted.processCorrectionDecisions});assert.equal(trusted.process.enforce_support_layers,'0');
 const direct=applyNativeCorrectionDecisions(processSettingsSelection(selection,accepted.overrides),{scope:'process',decisions:accepted.processCorrectionDecisions});assert.equal(direct.nativeChanges.enforce_support_layers,'0');
 assert.deepEqual(selection,original);assert.deepEqual(overrides,{spiral_mode:true});
});

test('declining vase preserves the hidden source, while stale or injected decisions are rejected',()=>{
 const selection={...resolved,nativeProcessSettings:{enforce_support_layers:'7'}},overrides={spiral_mode:true};
 const group=processSettingsState(selection,overrides).correctionPlan.groups.find(item=>item.id==='process:spiral-mode');
 const decision={id:group.id,signature:group.signature,choice:'alternative'};
 const result=acceptProcessCorrectionChoices(selection,overrides,[decision]);assert.equal(result.overrides.spiral_mode,'0');assert.equal(result.selection.process.enforce_support_layers,'7');assert.deepEqual(result.processCorrectionDecisions,[]);
 assert.throws(()=>acceptProcessCorrectionChoices(selection,{spiral_mode:true,wall_loops:8},[decision]),/changed/);
 assert.throws(()=>acceptProcessCorrectionChoices(selection,overrides,[{...decision,value:999}]),/only id/);
});

test('legacy scalar arrays and flattened project scalars share signatures and do not cause repeated corrections',()=>{
 const arraySource={...resolved,nativeProcessSettings:{enforce_support_layers:['7'],spiral_mode:['0']}};
 const group=processSettingsState(arraySource,{spiral_mode:true}).correctionPlan.groups.find(item=>item.id==='process:spiral-mode');
 const result=acceptProcessCorrectionChoices(arraySource,{spiral_mode:true},[{id:group.id,signature:group.signature,choice:'apply'}]);
 const flatSource={...resolved,nativeProcessSettings:{enforce_support_layers:'7',spiral_mode:'0'}};
 const flat=processSettingsSelection(flatSource,result.overrides,{processCorrectionDecisions:result.processCorrectionDecisions});assert.equal(flat.process.enforce_support_layers,'0');
 assert.ok(!processSettingsState(arraySource,result.overrides,{processCorrectionDecisions:result.processCorrectionDecisions}).corrections.some(item=>item.key==='enforce_support_layers'));
 const changed={...flatSource,nativeProcessSettings:{enforce_support_layers:'8'}};assert.throws(()=>processSettingsSelection(changed,result.overrides,{processCorrectionDecisions:result.processCorrectionDecisions}),/changed/);
});
