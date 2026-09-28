import test from 'node:test';import assert from 'node:assert/strict';
import {getNativeCorrectionPlan,applyNativeCorrectionDecisions} from '../../shared/native-setting-corrections.js';
import {normalizeProfileOverrides} from '../../shared/profile-settings.js';
const input=()=>({printer:{gcode_flavor:'marlin2',input_shaping_type:'ZV'},process:{spiral_mode:true,wall_loops:3,top_shell_layers:4,sparse_infill_density:'15%',enable_support:true,enforce_support_layers:5},filament:{},context:{isBblPrinter:false,supportWrappingDetection:false}});
const choose=(plan,id,choice='apply')=>{const group=plan.groups.find(item=>item.id.endsWith(id));assert.ok(group);return {id:group.id,signature:group.signature,choice};};

test('known hidden process changes are accepted only through an applicable source-derived correction',()=>{
 assert.throws(()=>normalizeProfileOverrides('process',{enforce_support_layers:0}),/Unsupported/);
 const selection=input(),before=structuredClone(selection),plan=getNativeCorrectionPlan(selection,{scope:'process'});
 const result=applyNativeCorrectionDecisions(selection,{scope:'process',decisions:[choose(plan,'spiral-mode')]});
 assert.equal(result.nativeChanges.enforce_support_layers,'0');assert.equal(result.selection.process.enforce_support_layers,'0');assert.equal(result.selection.process.wall_loops,'1');assert.equal(result.selection.process.spiral_mode,true);
 assert.deepEqual(selection,before);assert.ok(!result.remaining.groups.some(item=>item.id.endsWith('spiral-mode')));
});

test('declining a native group applies only the native alternative and retains existing hidden values',()=>{
 const selection=input(),plan=getNativeCorrectionPlan(selection,{scope:'process'});
 const result=applyNativeCorrectionDecisions(selection,{scope:'process',decisions:[choose(plan,'spiral-mode','alternative')]});
 assert.deepEqual(result.nativeChanges,{spiral_mode:'0'});assert.equal(result.selection.process.enforce_support_layers,5);assert.equal(result.selection.process.wall_loops,3);
});

test('arbitrary values, duplicate decisions, unknown scope, and cross-scope proposals are rejected atomically',()=>{
 const selection=input(),snapshot=structuredClone(selection),plan=getNativeCorrectionPlan(selection,{scope:'process'}),decision=choose(plan,'spiral-mode');
 assert.throws(()=>applyNativeCorrectionDecisions(selection,{scope:'process',decisions:[{...decision,value:{enforce_support_layers:999}}]}),/only id/);
 assert.throws(()=>applyNativeCorrectionDecisions(selection,{scope:'process',decisions:[decision,decision]}),/Duplicate/);
 assert.throws(()=>applyNativeCorrectionDecisions(selection,{scope:'machine',decisions:[decision]}),/Unknown or no longer/);
 assert.throws(()=>getNativeCorrectionPlan(selection,{scope:'arbitrary'}),/Unknown/);
 assert.deepEqual(selection,snapshot);
});

test('stale current values and forged proposal signatures cannot change hidden settings',()=>{
 const selection=input(),decision=choose(getNativeCorrectionPlan(selection,{scope:'process'}),'spiral-mode');
 selection.process.enforce_support_layers=9;
 assert.throws(()=>applyNativeCorrectionDecisions(selection,{scope:'process',decisions:[decision]}),/changed/);
 const current=choose(getNativeCorrectionPlan(selection,{scope:'process'}),'spiral-mode');
 assert.throws(()=>applyNativeCorrectionDecisions(selection,{scope:'process',decisions:[{...current,signature:current.signature.replace('"0"','"999"')}]}),/changed/);
 selection.process.spiral_mode=false;
 assert.throws(()=>applyNativeCorrectionDecisions(selection,{scope:'process',decisions:[current]}),/no longer applicable/);
});

test('automatic proposals apply only when requested and preserve native scalar/array shapes',()=>{
 const selection={...input(),process:{max_volumetric_extrusion_rate_slope:1,enable_arc_fitting:['1','1']}};
 let result=applyNativeCorrectionDecisions(selection,{scope:'process'});assert.deepEqual(result.nativeChanges,{});
 result=applyNativeCorrectionDecisions(selection,{scope:'process',applyAutomatic:true});assert.equal(result.nativeChanges.enable_arc_fitting,'0');assert.deepEqual(result.selection.process.enable_arc_fitting,['0','0']);
 assert.equal(result.selection.printer.input_shaping_type,'ZV');
});

test('plans are defensive and exact current native values normalize equivalent display shapes',()=>{
 const selection=input(),plan=getNativeCorrectionPlan(selection,{scope:'process'}),decision=choose(plan,'spiral-mode');
 plan.groups[0].changes[0].value='malicious';assert.notEqual(getNativeCorrectionPlan(selection,{scope:'process'}).groups[0].changes[0].value,'malicious');
 const equivalent={...selection,process:{...selection.process,wall_loops:'3',enforce_support_layers:'5',enable_support:'1'}};
 assert.equal(applyNativeCorrectionDecisions(equivalent,{scope:'process',decisions:[decision]}).nativeChanges.enforce_support_layers,'0');
});
