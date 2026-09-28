import test from 'node:test';import assert from 'node:assert/strict';
import {getNativeCorrectionPlan,applyNativeCorrectionDecisions} from '../../shared/native-setting-corrections.js';
import {getNativeSettingEvents} from '../../shared/native-setting-events.js';
const input=(key,process={},printer={},extra={})=>({process,printer,filament:{},context:{isBblPrinter:true,supportWrappingDetection:true,changedSetting:{scope:'process',key,...extra}}});
const decide=(selection,choice='apply')=>{const group=getNativeCorrectionPlan(selection,{scope:selection.context.changedSetting.scope}).groups[0];assert.ok(group);return applyNativeCorrectionDecisions(selection,{scope:group.scope,decisions:[{id:group.id,signature:group.signature,choice}]});};

test('native tower disable follows smooth warning then clumping warning only when keeping the disabled tower',()=>{
 const selection=input('enable_prime_tower',{enable_prime_tower:false,timelapse_type:'1',enable_wrapping_detection:true});
 let result=decide(selection,'alternative');assert.match(result.remaining.groups[0].id,/wrapping/);assert.equal(result.selection.process.enable_prime_tower,'0');
 result=decide(result.selection,'alternative');assert.ok(!result.remaining.groups.some(group=>group.event));
 result=decide(selection,'apply');assert.equal(result.selection.process.enable_prime_tower,'1');assert.ok(!result.remaining.groups.some(group=>group.event));
 assert.equal(getNativeSettingEvents(input('enable_prime_tower',{enable_prime_tower:false,timelapse_type:'0',enable_wrapping_detection:true})).length,0,'Native clumping check is nested inside the smooth timelapse branch');
});
test('precise Z, wrapping and geometry edit dialogs preserve no-op acceptance and revert choices',()=>{
 for(const [key,process]of [['precise_z_height',{precise_z_height:true,enable_prime_tower:true}],['enable_prime_tower',{enable_prime_tower:true,precise_z_height:true}],['enable_wrapping_detection',{enable_wrapping_detection:true,enable_prime_tower:false}],['make_overhang_printable',{make_overhang_printable:true}]]){
  const selection=input(key,process);let result=decide(selection,'alternative');assert.equal(result.selection.process[key],'1');assert.ok(!result.remaining.groups.some(group=>group.event));
  result=decide(selection);assert.equal(result.selection.process[key],'0');
 }
});
test('only native i3 by-object and Simple support-type edit conditions produce their dialogs',()=>{
 assert.equal(getNativeSettingEvents(input('print_sequence',{print_sequence:'by object'},{printer_structure:'corexy'})).length,0);
 assert.equal(decide(input('print_sequence',{print_sequence:'by object'},{printer_structure:'i3'})).selection.process.print_sequence,'by layer');
 let selection=input('support_type',{support_type:'tree(auto)',support_style:'organic'});assert.equal(getNativeSettingEvents(selection).length,0);
 selection.context.mode='Simple';const result=applyNativeCorrectionDecisions(selection,{scope:'process',applyAutomatic:true});assert.equal(result.selection.process.support_style,'default');
});
test('infill rotation warning requires the first nonempty edit and an unsafe native pattern',()=>{
 assert.equal(getNativeSettingEvents(input('sparse_infill_rotate_template',{sparse_infill_pattern:'grid',sparse_infill_rotate_template:'0,45'})).length,0,'Prior value is required, never guessed');
 assert.equal(getNativeSettingEvents(input('sparse_infill_rotate_template',{sparse_infill_pattern:'rectilinear',sparse_infill_rotate_template:'0,45'},{},{previousValue:''})).length,0);
 const selection=input('sparse_infill_rotate_template',{sparse_infill_pattern:'gyroid',sparse_infill_rotate_template:'0,45'},{},{previousValue:''});
 assert.equal(decide(selection).selection.process.sparse_infill_rotate_template,'');assert.equal(decide(selection,'alternative').selection.process.sparse_infill_rotate_template,'0,45');
});
test('layer edit uses all printer limits and permits the native ignore choice before passive correction checks',()=>{
 const selection=input('layer_height',{layer_height:'0.05'},{min_layer_height:['0.07','0.1'],max_layer_height:['0.2','0.3']});
 assert.equal(decide(selection).selection.process.layer_height,'0.07');const ignored=decide(selection,'alternative');assert.equal(ignored.selection.process.layer_height,'0.05');assert.ok(!ignored.remaining.groups.some(group=>group.event));
});
test('long-retraction native warning is an acknowledgment-only event and does not alter configuration',()=>{
 const selection={printer:{long_retractions_when_cut:['0','1']},process:{},filament:{},context:{changedSetting:{scope:'machine',key:'long_retractions_when_cut',index:1}}};
 const result=decide(selection);assert.deepEqual(result.nativeChanges,{});assert.deepEqual(result.selection.printer,selection.printer);assert.ok(!result.remaining.groups.some(group=>group.event));
});
