import test from 'node:test';import assert from 'node:assert/strict';import{normalizeUserPresetValues,projectNativeUserPreset}from'../../server/native-user-presets.js';
test('user-preset projection validates native scopes, metadata and dangerous settings before the helper',async()=>{
 let calls=0;const nativeConfig={run:async()=>{calls++;throw new Error('unexpected helper call');}};
 for(const settings of [{post_process:['echo injected']},{printhost_apikey:'secret'},{bed_custom_model:'/private/model.stl'},{unknown_key:'1'},{inherits:['A']},{compatible_printers_condition:42},{compatible_prints:['A']}])await assert.rejects(projectNativeUserPreset({type:'process',mode:'save',name:'Child',settings},{nativeConfig}));
 await assert.rejects(projectNativeUserPreset({type:'process',mode:'load',name:'Child',parent:{name:'Parent',settings:{}},document:{inherits:'Different'}},{nativeConfig}),/parent does not match/);
 await assert.rejects(projectNativeUserPreset({type:'process',mode:'load',name:'Child',parent:{name:'Parent',settings:{},file:'/tmp/injected'},document:{inherits:'Parent'}},{nativeConfig}),/Invalid native parent/);
 assert.equal(calls,0);
});
test('ordinary native values are canonicalized while explicit dependency empties and nil strings stay meaningful',()=>{
 assert.deepEqual(normalizeUserPresetValues('filament',{name:'Variant material',inherits:'A',filament_retraction_length:['nil',1.2],compatible_printers:[],compatible_printers_condition:'false'}),{filament_retraction_length:['nil','1.2'],name:'Variant material',inherits:'A',compatible_printers:[],compatible_printers_condition:'false'});
});
